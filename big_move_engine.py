"""
big_move_engine.py
==================
Big Move Score (BMS) Quantitative Engine & Anti-Flip Signal Generator.
Combines Market Microstructure Features + Machine Learning Probabilities into
15-20 minute persistent trading signals with risk management targets (SL/TP1/TP2).
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any
import numpy as np

from src.feature_pipeline import MicrostructureFeatures


class SignalType(str, Enum):
    STRONG_LONG = "STRONG LONG"
    LONG = "LONG"
    WAIT = "WAIT"
    SHORT = "SHORT"
    STRONG_SHORT = "STRONG SHORT"


@dataclass
class EngineConfig:
    # BMS Component Weights (sum ~ 1.0)
    w_ofi: float = 0.28
    w_obi: float = 0.22
    w_depth: float = 0.18
    w_taker: float = 0.16
    w_price_impact: float = 0.08
    w_trend: float = 0.08

    # Quant + ML Combination
    w_quant: float = 0.65
    w_ml: float = 0.35

    # Signal Thresholds
    strong_threshold: float = 0.68
    normal_threshold: float = 0.42
    min_agreement: float = 0.66
    min_ml_confirmation: float = 0.55

    # Anti-Flip & Persistence
    reversal_confirmations: int = 3
    valid_minutes: int = 20
    min_holding_minutes: int = 15

    # Risk Management
    atr_multiplier: float = 1.5
    min_risk_bps: float = 25.0  # minimum 0.25% stop distance


@dataclass
class RiskFlags:
    spread_risk: bool = False
    liquidity_risk: bool = False
    spoofing_risk: bool = False
    squeeze_risk: bool = False
    extreme_volatility: bool = False
    thin_order_book: bool = False
    abnormal_price_impact: bool = False

    def active_flags(self) -> List[str]:
        flags = []
        if self.spread_risk:
            flags.append("HIGH_SPREAD")
        if self.liquidity_risk:
            flags.append("LOW_LIQUIDITY")
        if self.spoofing_risk:
            flags.append("SPOOFING_DETECTED")
        if self.squeeze_risk:
            flags.append("VOLATILITY_SQUEEZE")
        if self.extreme_volatility:
            flags.append("EXTREME_VOLATILITY")
        if self.thin_order_book:
            flags.append("THIN_BOOK")
        if self.abnormal_price_impact:
            flags.append("ABNORMAL_IMPACT")
        return flags


@dataclass
class SignalResult:
    symbol: str
    timestamp: float
    created_at: str
    expires_at: str
    valid_minutes: int
    is_expired: bool
    signal_age_seconds: float

    signal: SignalType
    raw_signal: SignalType
    confidence: float  # 50.0 to 95.0%

    bms: float  # Big Move Score (-1.0 to +1.0)
    ml_long_prob: float
    ml_wait_prob: float
    ml_short_prob: float
    ml_score: float
    final_score: float

    directional_agreement: float  # 0.0 to 1.0
    agreement_breakdown: Dict[str, str]

    # Execution Targets
    entry_price: float
    stop_loss: float
    tp1: float  # 1:2 RR
    tp2: float  # 1:3 RR
    risk_distance: float
    rr_ratio_tp1: float = 2.0
    rr_ratio_tp2: float = 3.0

    risk_flags: RiskFlags = field(default_factory=RiskFlags)
    reversal_streak: int = 0

    def to_log_record(self, features: Optional[MicrostructureFeatures] = None) -> Dict[str, Any]:
        rec = {
            "timestamp": self.timestamp,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "symbol": self.symbol,
            "signal": self.signal.value,
            "raw_signal": self.raw_signal.value,
            "confidence": round(self.confidence, 1),
            "bms": round(self.bms, 4),
            "ml_long_prob": round(self.ml_long_prob, 4),
            "ml_wait_prob": round(self.ml_wait_prob, 4),
            "ml_short_prob": round(self.ml_short_prob, 4),
            "ml_score": round(self.ml_score, 4),
            "final_score": round(self.final_score, 4),
            "directional_agreement": round(self.directional_agreement, 3),
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "tp1": self.tp1,
            "tp2": self.tp2,
            "risk_distance": self.risk_distance,
            "risk_flags": ",".join(self.risk_flags.active_flags()) or "NONE",
        }
        if features:
            rec.update({
                "price": features.mid_price,
                "OBI5": features.obi_5,
                "OBI10": features.obi_10,
                "OBI20": features.obi_20,
                "OBI50": features.obi_50,
                "OFI": features.normalized_ofi,
                "TakerFlow": features.taker_flow,
                "DepthDepletion": features.directional_depth,
                "PriceImpact": features.price_impact_directional,
                "EMA10": features.ema_10,
                "EMA20": features.ema_20,
                "VWAP": features.vwap,
                "TrendScore": features.trend_score,
            })
        return rec


class BigMoveEngine:
    """
    Central Quantitative Research Engine with Anti-Flip Persistence and Expiry Management.
    """

    def __init__(self, config: Optional[EngineConfig] = None):
        self.config = config or EngineConfig()
        # Symbol state persistence
        self._active_signals: Dict[str, SignalResult] = {}
        self._candidate_reversal: Dict[str, SignalType] = {}
        self._reversal_confirmations_count: Dict[str, int] = {}
        self._signal_history: Dict[str, List[SignalResult]] = {}

    def compute_bms(self, features: MicrostructureFeatures) -> float:
        """
        BMS = 0.28 * OFI + 0.22 * OBI + 0.18 * DirectionalDepth + 0.16 * TakerFlow
              + 0.08 * PriceImpact + 0.08 * TrendScore
        Clamped to [-1.0, 1.0].
        """
        c = self.config
        norm_ofi = np.clip(features.ofi_zscore / 2.0, -1.0, 1.0)
        norm_obi = np.clip(features.combined_obi, -1.0, 1.0)
        norm_depth = np.clip(features.directional_depth, -1.0, 1.0)
        norm_taker = np.clip(features.taker_flow_zscore / 2.0, -1.0, 1.0)
        norm_impact = np.clip(features.price_impact_zscore / 2.0, -1.0, 1.0)
        norm_trend = np.clip(features.trend_score, -1.0, 1.0)

        raw_bms = (
            c.w_ofi * norm_ofi
            + c.w_obi * norm_obi
            + c.w_depth * norm_depth
            + c.w_taker * norm_taker
            + c.w_price_impact * norm_impact
            + c.w_trend * norm_trend
        )
        return float(np.clip(raw_bms, -1.0, 1.0))

    def evaluate_directional_agreement(
        self, features: MicrostructureFeatures, ml_direction: str
    ) -> Tuple[float, Dict[str, str]]:
        """
        Checks directional agreement across:
        OFI, OBI, Taker Flow, Depth Depletion, Trend, ML probability.
        Returns:
            agreement_ratio: float in [0.0, 1.0] indicating proportion of dominant direction
            breakdown: dictionary with component directions
        """
        components = {}
        
        # 1. OFI
        if features.normalized_ofi > 0.08:
            components["OFI"] = "BULLISH"
        elif features.normalized_ofi < -0.08:
            components["OFI"] = "BEARISH"
        else:
            components["OFI"] = "NEUTRAL"

        # 2. OBI
        if features.combined_obi > 0.10:
            components["OBI"] = "BULLISH"
        elif features.combined_obi < -0.10:
            components["OBI"] = "BEARISH"
        else:
            components["OBI"] = "NEUTRAL"

        # 3. Taker Flow
        if features.taker_flow > 0.12:
            components["TAKER"] = "BULLISH"
        elif features.taker_flow < -0.12:
            components["TAKER"] = "BEARISH"
        else:
            components["TAKER"] = "NEUTRAL"

        # 4. Depth Depletion
        if features.directional_depth > 0.10:
            components["DEPTH"] = "BULLISH"
        elif features.directional_depth < -0.10:
            components["DEPTH"] = "BEARISH"
        else:
            components["DEPTH"] = "NEUTRAL"

        # 5. Trend
        if features.trend_score > 0.15:
            components["TREND"] = "BULLISH"
        elif features.trend_score < -0.15:
            components["TREND"] = "BEARISH"
        else:
            components["TREND"] = "NEUTRAL"

        # 6. ML Direction
        components["ML"] = ml_direction.upper()

        bullish_count = sum(1 for v in components.values() if v == "BULLISH")
        bearish_count = sum(1 for v in components.values() if v == "BEARISH")
        total_valid = len(components)

        dominant_count = max(bullish_count, bearish_count)
        agreement_ratio = dominant_count / float(total_valid)

        return float(agreement_ratio), components

    def detect_risk_flags(
        self, features: MicrostructureFeatures, rolling_atr: float
    ) -> RiskFlags:
        """
        Evaluates microstructure warning flags:
        - spread risk: spread > 12 bps
        - liquidity risk: total depth in top 50 is low
        - spoofing risk: extreme OBI divergence from taker flow
        - squeeze risk: very low spread with massive depletion
        - extreme volatility: price impact z-score > 2.5
        - thin order book: top 5 depth < 10% of top 50
        - abnormal price impact: impact z-score > 2.2
        """
        flags = RiskFlags()
        if features.spread_bps > 12.0:
            flags.spread_risk = True

        if features.total_depth < 1.0:  # or symbol dependent threshold
            flags.liquidity_risk = True

        # Spoofing check: Huge book imbalance without taker trade confirmation
        if abs(features.combined_obi) > 0.50 and abs(features.taker_flow) < 0.05:
            flags.spoofing_risk = True

        # Squeeze risk: tight spread but huge directional depletion
        if features.spread_bps < 3.0 and abs(features.directional_depth) > 0.45:
            flags.squeeze_risk = True

        if abs(features.price_impact_zscore) > 2.4:
            flags.extreme_volatility = True
            flags.abnormal_price_impact = True

        top_5_ratio = (features.bid_depth_5 + features.ask_depth_5) / (features.total_depth + 1e-8)
        if top_5_ratio < 0.10:
            flags.thin_order_book = True

        return flags

    def calculate_targets(
        self,
        symbol: str,
        entry_price: float,
        signal: SignalType,
        rolling_atr: Optional[float] = None,
    ) -> Tuple[float, float, float, float]:
        """
        Calculates ATR-based Stop Loss, TP1 (1:2 RR), TP2 (1:3 RR).
        """
        c = self.config
        min_dist = entry_price * (c.min_risk_bps / 10000.0)
        
        if rolling_atr and rolling_atr > 0:
            risk_dist = max(rolling_atr * c.atr_multiplier, min_dist)
        else:
            risk_dist = min_dist

        if "LONG" in signal.value:
            sl = entry_price - risk_dist
            tp1 = entry_price + 2.0 * risk_dist
            tp2 = entry_price + 3.0 * risk_dist
        elif "SHORT" in signal.value:
            sl = entry_price + risk_dist
            tp1 = entry_price - 2.0 * risk_dist
            tp2 = entry_price - 3.0 * risk_dist
        else:
            sl = entry_price
            tp1 = entry_price
            tp2 = entry_price

        return sl, tp1, tp2, risk_dist

    def generate_signal(
        self,
        features: MicrostructureFeatures,
        ml_probs: Tuple[float, float, float],  # (P_LONG, P_WAIT, P_SHORT)
        rolling_atr: Optional[float] = None,
        current_time: Optional[float] = None,
    ) -> SignalResult:
        """
        Full signal decision process with Anti-Flip Persistence and Expiry.
        """
        c = self.config
        now_ts = current_time or features.timestamp
        symbol = features.symbol

        p_long, p_wait, p_short = ml_probs
        ml_score = float(p_long - p_short)
        
        if p_long > p_wait and p_long > p_short:
            ml_dir = "BULLISH"
        elif p_short > p_wait and p_short > p_long:
            ml_dir = "BEARISH"
        else:
            ml_dir = "NEUTRAL"

        # 1. BMS
        bms = self.compute_bms(features)

        # 2. Final Score: 0.65 * BMS + 0.35 * MLScore
        final_score = float(c.w_quant * bms + c.w_ml * ml_score)
        final_score = float(np.clip(final_score, -1.0, 1.0))

        # 3. Directional Agreement
        agreement, breakdown = self.evaluate_directional_agreement(features, ml_dir)

        # 4. Raw Signal Generation
        raw_signal = SignalType.WAIT
        if final_score >= c.strong_threshold and agreement >= c.min_agreement and p_long >= c.min_ml_confirmation:
            raw_signal = SignalType.STRONG_LONG
        elif final_score >= c.normal_threshold and agreement >= c.min_agreement:
            raw_signal = SignalType.LONG
        elif final_score <= -c.strong_threshold and agreement >= c.min_agreement and p_short >= c.min_ml_confirmation:
            raw_signal = SignalType.STRONG_SHORT
        elif final_score <= -c.normal_threshold and agreement >= c.min_agreement:
            raw_signal = SignalType.SHORT
        else:
            raw_signal = SignalType.WAIT

        # 5. Confidence computation (clamped between 50% and 95%)
        base_confidence = 50.0
        score_contrib = abs(final_score) * 25.0
        agree_contrib = max(0.0, agreement - 0.5) * 30.0
        ml_conf_contrib = max(p_long, p_short, p_wait) * 15.0
        computed_conf = float(np.clip(base_confidence + score_contrib + agree_contrib + ml_conf_contrib, 50.0, 95.0))

        # 6. Anti-Flip Persistence & Expiry Management
        prev_signal_result = self._active_signals.get(symbol)
        now_dt = datetime.fromtimestamp(now_ts, tz=timezone.utc)
        created_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
        expires_dt = datetime.fromtimestamp(now_ts + (c.valid_minutes * 60), tz=timezone.utc)
        expires_str = expires_dt.strftime("%Y-%m-%d %H:%M:%S")

        confirmed_signal = SignalType.WAIT
        streak = 0

        if prev_signal_result is None or prev_signal_result.signal == SignalType.WAIT:
            # No prior active directional signal => accept candidate if confirmed
            confirmed_signal = raw_signal
            streak = 1 if raw_signal != SignalType.WAIT else 0
        else:
            prev_sig = prev_signal_result.signal
            time_elapsed_sec = now_ts - prev_signal_result.timestamp
            is_expired = time_elapsed_sec > (c.valid_minutes * 60.0)

            if is_expired:
                # Signal expired after 20 minutes
                if raw_signal != SignalType.WAIT:
                    confirmed_signal = raw_signal
                    streak = 1
                else:
                    confirmed_signal = SignalType.WAIT
                    streak = 0
            else:
                # Signal still inside valid 20 min holding period
                is_opposite = (
                    ("LONG" in prev_sig.value and "SHORT" in raw_signal.value)
                    or ("SHORT" in prev_sig.value and "LONG" in raw_signal.value)
                )

                if is_opposite:
                    # Require N consecutive opposite observations
                    cand = self._candidate_reversal.get(symbol)
                    if cand == raw_signal:
                        streak = self._reversal_confirmations_count.get(symbol, 0) + 1
                    else:
                        streak = 1
                        self._candidate_reversal[symbol] = raw_signal

                    self._reversal_confirmations_count[symbol] = streak

                    if streak >= c.reversal_confirmations and agreement >= c.min_agreement:
                        # Genuine reversal confirmed!
                        confirmed_signal = raw_signal
                        self._candidate_reversal.pop(symbol, None)
                        self._reversal_confirmations_count.pop(symbol, None)
                    else:
                        # Hold previous signal until confirmed
                        confirmed_signal = prev_sig
                        created_str = prev_signal_result.created_at
                        expires_str = prev_signal_result.expires_at
                else:
                    # Same direction or temporary WAIT => maintain previous active signal
                    confirmed_signal = prev_sig if raw_signal == SignalType.WAIT else raw_signal
                    created_str = prev_signal_result.created_at
                    expires_str = prev_signal_result.expires_at
                    self._candidate_reversal.pop(symbol, None)
                    self._reversal_confirmations_count.pop(symbol, None)

        # 7. Risk Flags
        risk_flags = self.detect_risk_flags(features, rolling_atr or 0.0)

        # 8. Targets
        entry_price = features.mid_price
        sl, tp1, tp2, risk_dist = self.calculate_targets(symbol, entry_price, confirmed_signal, rolling_atr)

        age_sec = now_ts - (prev_signal_result.timestamp if prev_signal_result and confirmed_signal == prev_signal_result.signal else now_ts)

        result = SignalResult(
            symbol=symbol,
            timestamp=now_ts,
            created_at=created_str,
            expires_at=expires_str,
            valid_minutes=c.valid_minutes,
            is_expired=(age_sec > c.valid_minutes * 60),
            signal_age_seconds=max(0.0, age_sec),
            signal=confirmed_signal,
            raw_signal=raw_signal,
            confidence=computed_conf,
            bms=bms,
            ml_long_prob=p_long,
            ml_wait_prob=p_wait,
            ml_short_prob=p_short,
            ml_score=ml_score,
            final_score=final_score,
            directional_agreement=agreement,
            agreement_breakdown=breakdown,
            entry_price=entry_price,
            stop_loss=sl,
            tp1=tp1,
            tp2=tp2,
            risk_distance=risk_dist,
            risk_flags=risk_flags,
            reversal_streak=streak,
        )

        self._active_signals[symbol] = result
        history = self._signal_history.setdefault(symbol, [])
        history.append(result)
        if len(history) > 200:
            history.pop(0)

        return result
