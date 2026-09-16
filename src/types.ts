/**
 * types.ts
 * Shared quantitative market microstructure & machine learning signal types.
 */

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface AggTrade {
  id: number;
  price: number;
  qty: number;
  isBuyerMaker: boolean; // true = seller is taker (bearish), false = buyer is taker (bullish)
  timestamp: number;
}

export interface Kline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MicrostructureMetrics {
  symbol: string;
  timestamp: number;
  midPrice: number;
  spread: number;
  spreadBps: number;

  // Depth levels (top 5, 10, 20, 50)
  bidDepth5: number;
  askDepth5: number;
  bidDepth10: number;
  askDepth10: number;
  bidDepth20: number;
  askDepth20: number;
  bidDepth50: number;
  askDepth50: number;
  totalDepth: number;
  bidAskRatio: number;

  // Multi-level OBI
  obi5: number;
  obi10: number;
  obi20: number;
  obi50: number;
  combinedObi: number;

  // Order Flow Imbalance (OFI)
  rawOfi: number;
  normalizedOfi: number;
  ofiZScore: number;

  // Taker Flow
  buyVolume: number;
  sellVolume: number;
  takerFlow: number;
  takerVolumeRatio: number;
  takerFlowMomentum: number;
  takerFlowZScore: number;

  // Depth Depletion
  bidDepthDepletion: number;
  askDepthDepletion: number;
  directionalDepth: number;

  // Price Impact
  priceImpact: number;
  priceImpactDirectional: number;
  priceImpactZScore: number;

  // Trend System
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
}

export type SignalType = 'STRONG LONG' | 'LONG' | 'WAIT' | 'SHORT' | 'STRONG SHORT';

export interface MLPrediction {
  pLong: number;
  pWait: number;
  pShort: number;
  direction: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  confidence: number;
  mlScore: number; // pLong - pShort
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  confusionMatrix?: number[][];
  classDistribution?: { LONG: number; WAIT: number; SHORT: number };
  featureWeights?: Record<string, number>;
}

export interface RiskFlags {
  spreadRisk: boolean;
  liquidityRisk: boolean;
  spoofingRisk: boolean;
  squeezeRisk: boolean;
  extremeVolatility: boolean;
  thinOrderBook: boolean;
  abnormalPriceImpact: boolean;
  activeList: string[];
}

export interface SignalDecision {
  symbol: string;
  timestamp: number;
  createdAt: string;
  expiresAt: string;
  validMinutes: number;
  isExpired: boolean;
  ageSeconds: number;

  signal: SignalType;
  rawSignal: SignalType;
  confidence: number; // 50 - 95%

  bms: number; // Big Move Score
  ml: MLPrediction;
  finalScore: number;

  directionalAgreement: number; // 0.0 to 1.0
  agreementBreakdown: Record<string, 'BULLISH' | 'NEUTRAL' | 'BEARISH'>;

  // Risk & Execution targets
  entryPrice: number;
  stopLoss: number;
  tp1: number; // 1:2 RR
  tp2: number; // 1:3 RR
  riskDistance: number;

  riskFlags: RiskFlags;
  reversalConfirmations: number;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  isClosed: boolean;
  exitPrice?: number;
  exitReason?: 'STOP_LOSS' | 'TAKE_PROFIT_1' | 'TAKE_PROFIT_2' | 'MANUAL' | 'EXPIRED';
  pnlPct: number;
  openedAt: string;
  closedAt?: string;
}

export interface CoinData {
  symbol: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  orderBook?: OrderBookSnapshot;
  recentTrades: AggTrade[];
  klines: Kline[];
  metrics?: MicrostructureMetrics;
  signal?: SignalDecision;
  signalHistory: SignalDecision[];
  paperPosition?: PaperPosition;
  lastUpdated: number;
  isLoading: boolean;
  error?: string;
}

export interface EngineConfig {
  lambdaParam: number; // 0.10
  obiWeights: [number, number, number, number]; // [0.10, 0.15, 0.30, 0.45]
  bmsWeights: {
    ofi: number; // 0.28
    obi: number; // 0.22
    directionalDepth: number; // 0.18
    takerFlow: number; // 0.16
    priceImpact: number; // 0.08
    trendScore: number; // 0.08
  };
  quantWeight: number; // 0.65
  mlWeight: number; // 0.35
  strongThreshold: number; // 0.68
  normalThreshold: number; // 0.42
  minAgreement: number; // 0.66
  minMlConfirmation: number; // 0.50
  reversalConfirmations: number; // 3
  validMinutes: number; // 20
  minHoldingMinutes: number; // 15
  atrMultiplier: number; // 1.5
  minRiskBps: number; // 25 bps
}
