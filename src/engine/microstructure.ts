/**
 * microstructure.ts
 * Quantitative Market Microstructure Calculations.
 * Multi-Level OBI, Cont-Kukanov-Stoikov OFI, Taker Flow, Depth Depletion,
 * Price Impact, and EMA/VWAP/Fourier Trend System.
 */

import { AggTrade, EngineConfig, Kline, MicrostructureMetrics, OrderBookSnapshot } from '../types';

export class MicrostructureEngine {
  private static prevBooks: Map<string, OrderBookSnapshot> = new Map();
  private static ofiHistories: Map<string, number[]> = new Map();
  private static takerFlowHistories: Map<string, number[]> = new Map();
  private static impactHistories: Map<string, number[]> = new Map();
  private static prevTakerFlows: Map<string, number> = new Map();

  public static reset(symbol?: string) {
    if (symbol) {
      this.prevBooks.delete(symbol);
      this.ofiHistories.delete(symbol);
      this.takerFlowHistories.delete(symbol);
      this.impactHistories.delete(symbol);
      this.prevTakerFlows.delete(symbol);
    } else {
      this.prevBooks.clear();
      this.ofiHistories.clear();
      this.takerFlowHistories.clear();
      this.impactHistories.clear();
      this.prevTakerFlows.clear();
    }
  }

  public static computeMetrics(
    symbol: string,
    currentBook: OrderBookSnapshot,
    trades: AggTrade[],
    klines: Kline[],
    config: EngineConfig,
    epsilon: number = 1e-8
  ): MicrostructureMetrics {
    const bids = currentBook.bids;
    const asks = currentBook.asks;

    // 1. Basic Depth & Spread
    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;
    const midPrice = (bestBid + bestAsk) / 2 || bestBid || bestAsk;
    const spread = Math.max(0, bestAsk - bestBid);
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

    const sumQty = (levels: { price: number; qty: number }[], count: number): number => {
      let sum = 0;
      const limit = Math.min(count, levels.length);
      for (let i = 0; i < limit; i++) {
        sum += levels[i].qty;
      }
      return sum;
    };

    const bidDepth5 = sumQty(bids, 5);
    const askDepth5 = sumQty(asks, 5);
    const bidDepth10 = sumQty(bids, 10);
    const askDepth10 = sumQty(asks, 10);
    const bidDepth20 = sumQty(bids, 20);
    const askDepth20 = sumQty(asks, 20);
    const bidDepth50 = sumQty(bids, 50);
    const askDepth50 = sumQty(asks, 50);

    const totalDepth = bidDepth50 + askDepth50;
    const bidAskRatio = (bidDepth50 + epsilon) / (askDepth50 + epsilon);

    // 2. Multi-Level OBI
    // w_k = exp(-lambda * (k - 1))
    const lambda = config.lambdaParam;
    const maxLevels = Math.min(50, bids.length, asks.length);

    const computeObiK = (k: number): number => {
      const limit = Math.min(k, maxLevels);
      if (limit === 0) return 0;
      let weightedImbSum = 0;
      let weightSum = 0;

      for (let i = 0; i < limit; i++) {
        const b = bids[i].qty;
        const a = asks[i].qty;
        const imb = (b - a) / (b + a + epsilon);
        const w = Math.exp(-lambda * i);
        weightedImbSum += w * imb;
        weightSum += w;
      }

      return weightSum > 0 ? weightedImbSum / weightSum : 0;
    };

    const obi5 = computeObiK(5);
    const obi10 = computeObiK(10);
    const obi20 = computeObiK(20);
    const obi50 = computeObiK(50);

    const [w5, w10, w20, w50] = config.obiWeights;
    const combinedObi = Math.max(-1, Math.min(1, w5 * obi5 + w10 * obi10 + w20 * obi20 + w50 * obi50));

    // 3. Order Flow Imbalance (OFI)
    const prevBook = this.prevBooks.get(symbol);
    let rawOfi = 0;
    let normalizedOfi = 0;

    if (prevBook && prevBook.bids.length > 0 && prevBook.asks.length > 0 && bids.length > 0 && asks.length > 0) {
      const p_b_curr = bids[0].price;
      const q_b_curr = bids[0].qty;
      const p_b_prev = prevBook.bids[0].price;
      const q_b_prev = prevBook.bids[0].qty;

      const p_a_curr = asks[0].price;
      const q_a_curr = asks[0].qty;
      const p_a_prev = prevBook.asks[0].price;
      const q_a_prev = prevBook.asks[0].qty;

      let deltaBid = 0;
      if (p_b_curr > p_b_prev) {
        deltaBid = q_b_curr;
      } else if (p_b_curr === p_b_prev) {
        deltaBid = q_b_curr - q_b_prev;
      } else {
        deltaBid = -q_b_prev;
      }

      let deltaAsk = 0;
      if (p_a_curr < p_a_prev) {
        deltaAsk = q_a_curr;
      } else if (p_a_curr === p_a_prev) {
        deltaAsk = q_a_curr - q_a_prev;
      } else {
        deltaAsk = -q_a_prev;
      }

      rawOfi = deltaBid - deltaAsk;
      const normDepth = Math.max(totalDepth, (q_b_curr + q_a_curr) * 4);
      normalizedOfi = Math.max(-1, Math.min(1, rawOfi / (normDepth + epsilon)));
    }

    // OFI Rolling z-score
    let ofiHistory = this.ofiHistories.get(symbol);
    if (!ofiHistory) {
      ofiHistory = [];
      this.ofiHistories.set(symbol, ofiHistory);
    }
    ofiHistory.push(normalizedOfi);
    if (ofiHistory.length > 40) ofiHistory.shift();

    const ofiZScore = this.calcZScore(ofiHistory, normalizedOfi, epsilon);

    // 4. Taker Flow
    let buyVolume = 0;
    let sellVolume = 0;
    trades.forEach((t) => {
      if (t.isBuyerMaker) {
        sellVolume += t.qty;
      } else {
        buyVolume += t.qty;
      }
    });

    const totTradeVol = buyVolume + sellVolume;
    const takerFlow = totTradeVol > 0 ? (buyVolume - sellVolume) / (totTradeVol + epsilon) : 0;
    const takerVolumeRatio = (buyVolume + epsilon) / (sellVolume + epsilon);

    const prevTaker = this.prevTakerFlows.get(symbol) ?? takerFlow;
    const takerFlowMomentum = takerFlow - prevTaker;
    this.prevTakerFlows.set(symbol, takerFlow);

    let takerHistory = this.takerFlowHistories.get(symbol);
    if (!takerHistory) {
      takerHistory = [];
      this.takerFlowHistories.set(symbol, takerHistory);
    }
    takerHistory.push(takerFlow);
    if (takerHistory.length > 40) takerHistory.shift();
    const takerFlowZScore = this.calcZScore(takerHistory, takerFlow, epsilon);

    // 5. Depth Depletion
    let bidDepthDepletion = 0;
    let askDepthDepletion = 0;
    let directionalDepth = 0;

    if (prevBook && prevBook.bids.length >= 10 && prevBook.asks.length >= 10) {
      const prevB10 = sumQty(prevBook.bids, 10);
      const prevA10 = sumQty(prevBook.asks, 10);
      bidDepthDepletion = Math.max(-1, Math.min(1, (prevB10 - bidDepth10) / (prevB10 + epsilon)));
      askDepthDepletion = Math.max(-1, Math.min(1, (prevA10 - askDepth10) / (prevA10 + epsilon)));
      // DirectionalDepth: Ask depleted more than Bid => Bullish (+), Bid depleted more => Bearish (-)
      directionalDepth = Math.max(-1, Math.min(1, askDepthDepletion - bidDepthDepletion));
    }

    // 6. Price Impact
    const prevMid = prevBook && prevBook.bids.length > 0 ? (prevBook.bids[0].price + prevBook.asks[0].price) / 2 : midPrice;
    const ret = prevMid > 0 ? (midPrice - prevMid) / prevMid : 0;
    const priceImpact = Math.abs(ret) / (Math.abs(normalizedOfi) + 0.05 + epsilon);
    const priceImpactDirectional = (ret >= 0 ? 1 : -1) * priceImpact;

    let impactHistory = this.impactHistories.get(symbol);
    if (!impactHistory) {
      impactHistory = [];
      this.impactHistories.set(symbol, impactHistory);
    }
    impactHistory.push(priceImpactDirectional);
    if (impactHistory.length > 40) impactHistory.shift();
    const priceImpactZScore = this.calcZScore(impactHistory, priceImpactDirectional, epsilon);

    // 7. Trend System (EMA10, EMA20, VWAP, Fourier Trend)
    const trendSystem = this.computeTrend(klines, midPrice, epsilon);

    // Update previous book cache
    this.prevBooks.set(symbol, currentBook);

    return {
      symbol,
      timestamp: currentBook.timestamp,
      midPrice,
      spread,
      spreadBps,
      bidDepth5,
      askDepth5,
      bidDepth10,
      askDepth10,
      bidDepth20,
      askDepth20,
      bidDepth50,
      askDepth50,
      totalDepth,
      bidAskRatio,
      obi5,
      obi10,
      obi20,
      obi50,
      combinedObi,
      rawOfi,
      normalizedOfi,
      ofiZScore,
      buyVolume,
      sellVolume,
      takerFlow,
      takerVolumeRatio,
      takerFlowMomentum,
      takerFlowZScore,
      bidDepthDepletion,
      askDepthDepletion,
      directionalDepth,
      priceImpact,
      priceImpactDirectional,
      priceImpactZScore,
      ema10: trendSystem.ema10,
      ema20: trendSystem.ema20,
      emaTrend: trendSystem.emaTrend,
      emaSlope: trendSystem.emaSlope,
      priceRelEma10: trendSystem.priceRelEma10,
      priceRelEma20: trendSystem.priceRelEma20,
      vwap: trendSystem.vwap,
      vwapDistance: trendSystem.vwapDistance,
      fourierTrend: trendSystem.fourierTrend,
      trendScore: trendSystem.trendScore,
    };
  }

  private static calcZScore(history: number[], val: number, epsilon: number): number {
    if (history.length < 4) return Math.max(-3, Math.min(3, val));
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
    const std = Math.sqrt(variance);
    const z = (val - mean) / (std + epsilon);
    return Math.max(-3, Math.min(3, z));
  }

  private static computeTrend(
    klines: Kline[],
    currentPrice: number,
    epsilon: number
  ): {
    ema10: number;
    ema20: number;
    emaTrend: number;
    emaSlope: number;
    priceRelEma10: number;
    priceRelEma20: number;
    vwap: number;
    vwapDistance: number;
    fourierTrend: number;
    trendScore: number;
  } {
    if (klines.length < 20) {
      return {
        ema10: currentPrice,
        ema20: currentPrice,
        emaTrend: 0,
        emaSlope: 0,
        priceRelEma10: 0,
        priceRelEma20: 0,
        vwap: currentPrice,
        vwapDistance: 0,
        fourierTrend: 0,
        trendScore: 0,
      };
    }

    const closes = klines.map((k) => k.close);
    const volumes = klines.map((k) => k.volume);
    const typicalPrices = klines.map((k) => (k.high + k.low + k.close) / 3);

    // Calculate EMA series
    const calcEmaSeries = (period: number): number[] => {
      const k = 2 / (period + 1);
      const ema: number[] = [closes[0]];
      for (let i = 1; i < closes.length; i++) {
        ema.push(closes[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    };

    const ema10Series = calcEmaSeries(10);
    const ema20Series = calcEmaSeries(20);

    const ema10 = ema10Series[ema10Series.length - 1];
    const ema20 = ema20Series[ema20Series.length - 1];

    // EMA Trend & Slope
    const rawEmaTrend = (ema10 - ema20) / (currentPrice + epsilon);
    const emaTrend = Math.tanh(rawEmaTrend * 400); // normalized -1 to +1

    const ema10Prev = ema10Series[Math.max(0, ema10Series.length - 4)];
    const emaSlope = (ema10 - ema10Prev) / (currentPrice * 3 + epsilon);

    const priceRelEma10 = (currentPrice - ema10) / (ema10 + epsilon);
    const priceRelEma20 = (currentPrice - ema20) / (ema20 + epsilon);

    // VWAP
    let cumVolume = 0;
    let cumTypicalVol = 0;
    for (let i = 0; i < klines.length; i++) {
      cumTypicalVol += typicalPrices[i] * volumes[i];
      cumVolume += volumes[i];
    }
    const vwap = cumVolume > 0 ? cumTypicalVol / cumVolume : currentPrice;
    const rawVwapDist = (currentPrice - vwap) / (vwap + epsilon);
    const vwapDistance = Math.tanh(rawVwapDist * 300);

    // Fourier Low-Frequency Harmonic Cycle
    const fourierTrend = this.calcFourierTrend(closes);

    // Composite TrendScore: 0.45 * EMA trend + 0.30 * VWAP distance + 0.25 * Fourier trend
    const trendScore = Math.max(
      -1,
      Math.min(1, 0.45 * emaTrend + 0.30 * vwapDistance + 0.25 * fourierTrend)
    );

    return {
      ema10,
      ema20,
      emaTrend,
      emaSlope,
      priceRelEma10,
      priceRelEma20,
      vwap,
      vwapDistance,
      fourierTrend,
      trendScore,
    };
  }

  /**
   * Fast Discrete Fourier Harmonic analysis on the closing prices
   */
  private static calcFourierTrend(closes: number[]): number {
    const n = closes.length;
    if (n < 16) return 0;

    // Linear detrend
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX + 1e-8);
    const intercept = (sumY - slope * sumX) / n;

    const detrended = closes.map((c, i) => c - (slope * i + intercept));

    // Extract dominant low-frequency harmonic (k = 1, 2)
    let re1 = 0;
    let im1 = 0;
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * 1 * t) / n;
      re1 += detrended[t] * Math.cos(angle);
      im1 -= detrended[t] * Math.sin(angle);
    }
    re1 /= n;
    im1 /= n;

    // Phase angle derivative at the endpoint
    const endT = n - 1;
    const angleEnd = (2 * Math.PI * 1 * endT) / n;
    // Derivative of A*cos(w*t) - B*sin(w*t)
    const harmonicSlope = (2 * Math.PI / n) * (-re1 * Math.sin(angleEnd) - im1 * Math.cos(angleEnd));

    const meanPrice = sumY / n;
    const normLinear = Math.tanh((slope / (meanPrice + 1e-8)) * 1000);
    const normHarmonic = Math.tanh((harmonicSlope / (meanPrice + 1e-8)) * 1000);

    return Math.max(-1, Math.min(1, 0.65 * normLinear + 0.35 * normHarmonic));
  }
}
