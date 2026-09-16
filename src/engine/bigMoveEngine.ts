/**
 * bigMoveEngine.ts
 * Big Move Score (BMS), Quant + ML Combination, Anti-Flip Persistence,
 * Directional Agreement, Risk Targets (SL/TP1/TP2), and Expiry Management.
 */

import {
  EngineConfig,
  MicrostructureMetrics,
  MLPrediction,
  RiskFlags,
  SignalDecision,
  SignalType,
} from '../types';

export const DEFAULT_CONFIG: EngineConfig = {
  lambdaParam: 0.10,
  obiWeights: [0.10, 0.15, 0.30, 0.45],
  bmsWeights: {
    ofi: 0.28,
    obi: 0.22,
    directionalDepth: 0.18,
    takerFlow: 0.16,
    priceImpact: 0.08,
    trendScore: 0.08,
  },
  quantWeight: 0.65,
  mlWeight: 0.35,
  strongThreshold: 0.68,
  normalThreshold: 0.42,
  minAgreement: 0.66,
  minMlConfirmation: 0.50,
  reversalConfirmations: 3,
  validMinutes: 20,
  minHoldingMinutes: 15,
  atrMultiplier: 1.5,
  minRiskBps: 25,
};

export class BigMoveEngine {
  private static activeSignals: Map<string, SignalDecision> = new Map();
  private static candidateReversals: Map<string, SignalType> = new Map();
  private static reversalCounts: Map<string, number> = new Map();

  public static reset(symbol?: string) {
    if (symbol) {
      this.activeSignals.delete(symbol);
      this.candidateReversals.delete(symbol);
      this.reversalCounts.delete(symbol);
    } else {
      this.activeSignals.clear();
      this.candidateReversals.clear();
      this.reversalCounts.clear();
    }
  }

  /**
   * Calculates Big Move Score (BMS) in range [-1.0, 1.0]
   */
  public static computeBMS(metrics: MicrostructureMetrics, config: EngineConfig): number {
    const w = config.bmsWeights;

    const normOfi = Math.max(-1, Math.min(1, metrics.ofiZScore / 2.0));
    const normObi = Math.max(-1, Math.min(1, metrics.combinedObi));
    const normDepth = Math.max(-1, Math.min(1, metrics.directionalDepth));
    const normTaker = Math.max(-1, Math.min(1, metrics.takerFlowZScore / 2.0));
    const normImpact = Math.max(-1, Math.min(1, metrics.priceImpactZScore / 2.0));
    const normTrend = Math.max(-1, Math.min(1, metrics.trendScore));

    const bms =
      w.ofi * normOfi +
      w.obi * normObi +
      w.directionalDepth * normDepth +
      w.takerFlow * normTaker +
      w.priceImpact * normImpact +
      w.trendScore * normTrend;

    return Math.max(-1, Math.min(1, bms));
  }

  /**
   * Checks directional agreement across all microstructure & ML components
   */
  public static checkDirectionalAgreement(
    metrics: MicrostructureMetrics,
    ml: MLPrediction
  ): {
    agreement: number;
    breakdown: Record<string, 'BULLISH' | 'NEUTRAL' | 'BEARISH'>;
  } {
    const breakdown: Record<string, 'BULLISH' | 'NEUTRAL' | 'BEARISH'> = {};

    // 1. OFI
    breakdown['OFI'] = metrics.normalizedOfi > 0.08 ? 'BULLISH' : metrics.normalizedOfi < -0.08 ? 'BEARISH' : 'NEUTRAL';

    // 2. OBI
    breakdown['OBI'] = metrics.combinedObi > 0.10 ? 'BULLISH' : metrics.combinedObi < -0.10 ? 'BEARISH' : 'NEUTRAL';

    // 3. Taker Flow
    breakdown['TAKER'] = metrics.takerFlow > 0.12 ? 'BULLISH' : metrics.takerFlow < -0.12 ? 'BEARISH' : 'NEUTRAL';

    // 4. Depth Depletion
    breakdown['DEPTH'] = metrics.directionalDepth > 0.10 ? 'BULLISH' : metrics.directionalDepth < -0.10 ? 'BEARISH' : 'NEUTRAL';

    // 5. Trend
    breakdown['TREND'] = metrics.trendScore > 0.15 ? 'BULLISH' : metrics.trendScore < -0.15 ? 'BEARISH' : 'NEUTRAL';

    // 6. ML
    breakdown['ML'] = ml.direction;

    const values = Object.values(breakdown);
    const bullishCount = values.filter((v) => v === 'BULLISH').length;
    const bearishCount = values.filter((v) => v === 'BEARISH').length;
    const maxCount = Math.max(bullishCount, bearishCount);

    const agreement = maxCount / values.length;
    return { agreement, breakdown };
  }

  /**
   * Detects market risk warnings without silently tampering with raw signal calculations
   */
  public static detectRiskFlags(metrics: MicrostructureMetrics): RiskFlags {
    const activeList: string[] = [];

    const spreadRisk = metrics.spreadBps > 10.0;
    if (spreadRisk) activeList.push('HIGH_SPREAD');

    const liquidityRisk = metrics.totalDepth < 5.0; // coin dependent
    if (liquidityRisk) activeList.push('LOW_LIQUIDITY');

    // Spoofing risk: huge book imbalance without trade confirmation
    const spoofingRisk = Math.abs(metrics.combinedObi) > 0.55 && Math.abs(metrics.takerFlow) < 0.06;
    if (spoofingRisk) activeList.push('SPOOFING_RISK');

    // Squeeze risk: very low spread with massive depletion
    const squeezeRisk = metrics.spreadBps < 2.5 && Math.abs(metrics.directionalDepth) > 0.40;
    if (squeezeRisk) activeList.push('SQUEEZE_RISK');

    const extremeVolatility = Math.abs(metrics.priceImpactZScore) > 2.4;
    if (extremeVolatility) activeList.push('EXTREME_VOLATILITY');

    const top5Ratio = (metrics.bidDepth5 + metrics.askDepth5) / (metrics.totalDepth + 1e-8);
    const thinOrderBook = top5Ratio < 0.10;
    if (thinOrderBook) activeList.push('THIN_BOOK');

    const abnormalPriceImpact = Math.abs(metrics.priceImpactZScore) > 2.0;
    if (abnormalPriceImpact) activeList.push('ABNORMAL_IMPACT');

    return {
      spreadRisk,
      liquidityRisk,
      spoofingRisk,
      squeezeRisk,
      extremeVolatility,
      thinOrderBook,
      abnormalPriceImpact,
      activeList,
    };
  }

  /**
   * Main Signal Decision Engine with Anti-Flip Persistence and Expiry Management
   */
  public static evaluateSignal(
    metrics: MicrostructureMetrics,
    ml: MLPrediction,
    rollingAtr: number = 0,
    config: EngineConfig = DEFAULT_CONFIG
  ): SignalDecision {
    const symbol = metrics.symbol;
    const nowTs = Date.now();

    // 1. Compute BMS
    const bms = this.computeBMS(metrics, config);

    // 2. Combine Quant Score and ML Score
    // FinalScore = 0.65 * BMS + 0.35 * MLScore
    const finalScore = Math.max(
      -1,
      Math.min(1, config.quantWeight * bms + config.mlWeight * ml.mlScore)
    );

    // 3. Directional Agreement
    const { agreement, breakdown } = this.checkDirectionalAgreement(metrics, ml);

    // 4. Raw Signal Determination
    let rawSignal: SignalType = 'WAIT';
    if (
      finalScore >= config.strongThreshold &&
      agreement >= config.minAgreement &&
      ml.pLong >= config.minMlConfirmation
    ) {
      rawSignal = 'STRONG LONG';
    } else if (finalScore >= config.normalThreshold && agreement >= config.minAgreement) {
      rawSignal = 'LONG';
    } else if (
      finalScore <= -config.strongThreshold &&
      agreement >= config.minAgreement &&
      ml.pShort >= config.minMlConfirmation
    ) {
      rawSignal = 'STRONG SHORT';
    } else if (finalScore <= -config.normalThreshold && agreement >= config.minAgreement) {
      rawSignal = 'SHORT';
    } else {
      rawSignal = 'WAIT';
    }

    // 5. Confidence Calculation (clamped 50% to 95%)
    const baseConf = 50.0;
    const scoreContrib = Math.abs(finalScore) * 25.0;
    const agreeContrib = Math.max(0, agreement - 0.5) * 30.0;
    const mlContrib = ml.confidence * 15.0;
    const confidence = Math.max(50.0, Math.min(95.0, baseConf + scoreContrib + agreeContrib + mlContrib));

    // 6. Anti-Flip Persistence & Expiry Logic
    const prevSignal = this.activeSignals.get(symbol);
    const validMs = config.validMinutes * 60 * 1000;

    let confirmedSignal: SignalType = 'WAIT';
    let createdAt = new Date(nowTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let expiresAt = new Date(nowTs + validMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let isExpired = false;
    let ageSeconds = 0;
    let confirmations = 0;

    if (!prevSignal || prevSignal.signal === 'WAIT') {
      // First signal or starting from WAIT: accept candidate immediately if valid
      confirmedSignal = rawSignal;
      confirmations = rawSignal !== 'WAIT' ? 1 : 0;
    } else {
      const elapsedMs = nowTs - prevSignal.timestamp;
      ageSeconds = Math.floor(elapsedMs / 1000);
      isExpired = elapsedMs > validMs;

      if (isExpired) {
        // Signal expired after 20 minutes
        if (rawSignal !== 'WAIT') {
          confirmedSignal = rawSignal;
          confirmations = 1;
        } else {
          confirmedSignal = 'WAIT';
          confirmations = 0;
        }
      } else {
        // Still within 20-minute holding window
        const prevDir = prevSignal.signal.includes('LONG') ? 'LONG' : prevSignal.signal.includes('SHORT') ? 'SHORT' : 'WAIT';
        const rawDir = rawSignal.includes('LONG') ? 'LONG' : rawSignal.includes('SHORT') ? 'SHORT' : 'WAIT';

        if (rawDir !== 'WAIT' && rawDir !== prevDir) {
          // Attempting reversal! Require N consecutive confirmations
          const candidate = this.candidateReversals.get(symbol);
          if (candidate === rawSignal) {
            confirmations = (this.reversalCounts.get(symbol) || 0) + 1;
          } else {
            confirmations = 1;
            this.candidateReversals.set(symbol, rawSignal);
          }
          this.reversalCounts.set(symbol, confirmations);

          if (confirmations >= config.reversalConfirmations && agreement >= config.minAgreement) {
            // Reversal confirmed!
            confirmedSignal = rawSignal;
            this.candidateReversals.delete(symbol);
            this.reversalCounts.delete(symbol);
          } else {
            // Hold previous signal to prevent flip
            confirmedSignal = prevSignal.signal;
            createdAt = prevSignal.createdAt;
            expiresAt = prevSignal.expiresAt;
          }
        } else if (rawSignal === 'WAIT') {
          // Temporary dip into WAIT does not immediately destroy active 15-20 min signal
          confirmedSignal = prevSignal.signal;
          createdAt = prevSignal.createdAt;
          expiresAt = prevSignal.expiresAt;
          this.candidateReversals.delete(symbol);
          this.reversalCounts.delete(symbol);
        } else {
          // Same direction (e.g. LONG -> STRONG LONG or vice-versa)
          confirmedSignal = rawSignal;
          createdAt = prevSignal.createdAt;
          expiresAt = prevSignal.expiresAt;
          this.candidateReversals.delete(symbol);
          this.reversalCounts.delete(symbol);
        }
      }
    }

    // 7. Risk Targets (SL, TP1 [1:2 RR], TP2 [1:3 RR])
    const entryPrice = metrics.midPrice;
    const minRiskDist = entryPrice * (config.minRiskBps / 10000);
    const riskDistance = Math.max(rollingAtr * config.atrMultiplier, minRiskDist);

    let stopLoss = entryPrice;
    let tp1 = entryPrice;
    let tp2 = entryPrice;

    if (confirmedSignal.includes('LONG')) {
      stopLoss = entryPrice - riskDistance;
      tp1 = entryPrice + 2.0 * riskDistance;
      tp2 = entryPrice + 3.0 * riskDistance;
    } else if (confirmedSignal.includes('SHORT')) {
      stopLoss = entryPrice + riskDistance;
      tp1 = entryPrice - 2.0 * riskDistance;
      tp2 = entryPrice - 3.0 * riskDistance;
    }

    // 8. Risk Flags
    const riskFlags = this.detectRiskFlags(metrics);

    const decision: SignalDecision = {
      symbol,
      timestamp: nowTs,
      createdAt,
      expiresAt,
      validMinutes: config.validMinutes,
      isExpired,
      ageSeconds,
      signal: confirmedSignal,
      rawSignal,
      confidence,
      bms,
      ml,
      finalScore,
      directionalAgreement: agreement,
      agreementBreakdown: breakdown,
      entryPrice,
      stopLoss,
      tp1,
      tp2,
      riskDistance,
      riskFlags,
      reversalConfirmations: confirmations,
    };

    this.activeSignals.set(symbol, decision);
    return decision;
  }
}
