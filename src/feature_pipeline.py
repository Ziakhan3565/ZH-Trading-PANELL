"""
feature_pipeline.py
===================
Quantitative Market Microstructure Research Pipeline for Binance Spot & Futures Data.
Computes multi-level OBI, OFI, Taker Flow, Depth Depletion, Price Impact, and Trend.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd


@dataclass
class OrderBookSnapshot:
    symbol: str
    timestamp: float
    bids: List[Tuple[float, float]]  # [(price, qty), ...] sorted descending by price
    asks: List[Tuple[float, float]]  # [(price, qty), ...] sorted ascending by price


@dataclass
class MicrostructureFeatures:
    symbol: str
    timestamp: float
    mid_price: float
    spread: float
    spread_bps: float
    
    # Depth levels
    bid_depth_5: float
    ask_depth_5: float
    bid_depth_10: float
    ask_depth_10: float
    bid_depth_20: float
    ask_depth_20: float
    bid_depth_50: float
    ask_depth_50: float
    total_depth: float
    bid_ask_ratio: float
    
    # Multi-level OBI
    obi_5: float
    obi_10: float
    obi_20: float
    obi_50: float
    combined_obi: float
    
    # OFI
    raw_ofi: float
    normalized_ofi: float
    ofi_zscore: float
    
    # Taker flow
    buy_volume: float
    sell_volume: float
    taker_flow: float
    taker_volume_ratio: float
    taker_flow_momentum: float
    taker_flow_zscore: float
    
    # Depth depletion
    bid_depth_depletion: float
    ask_depth_depletion: float
    directional_depth: float
    
    # Price impact
    price_impact: float
    price_impact_directional: float
    price_impact_zscore: float
    
    # Trend features
    ema_10: float
    ema_20: float
    ema_trend: float
    ema_slope: float
    price_rel_ema10: float
    price_rel_ema20: float
    vwap: float
    vwap_distance: float
    fourier_trend: float
    trend_score: float
    
    # Raw dictionary representation for ML / CSV export
    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "mid_price": self.mid_price,
            "spread": self.spread,
            "spread_bps": self.spread_bps,
            "bid_depth_5": self.bid_depth_5,
            "ask_depth_5": self.ask_depth_5,
            "bid_depth_10": self.bid_depth_10,
            "ask_depth_10": self.ask_depth_10,
            "bid_depth_20": self.bid_depth_20,
            "ask_depth_20": self.ask_depth_20,
            "bid_depth_50": self.bid_depth_50,
            "ask_depth_50": self.ask_depth_50,
            "total_depth": self.total_depth,
            "bid_ask_ratio": self.bid_ask_ratio,
            "obi_5": self.obi_5,
            "obi_10": self.obi_10,
            "obi_20": self.obi_20,
            "obi_50": self.obi_50,
            "combined_obi": self.combined_obi,
            "raw_ofi": self.raw_ofi,
            "normalized_ofi": self.normalized_ofi,
            "ofi_zscore": self.ofi_zscore,
            "buy_volume": self.buy_volume,
            "sell_volume": self.sell_volume,
            "taker_flow": self.taker_flow,
            "taker_volume_ratio": self.taker_volume_ratio,
            "taker_flow_momentum": self.taker_flow_momentum,
            "taker_flow_zscore": self.taker_flow_zscore,
            "bid_depth_depletion": self.bid_depth_depletion,
            "ask_depth_depletion": self.ask_depth_depletion,
            "directional_depth": self.directional_depth,
            "price_impact": self.price_impact,
            "price_impact_directional": self.price_impact_directional,
            "price_impact_zscore": self.price_impact_zscore,
            "ema_10": self.ema_10,
            "ema_20": self.ema_20,
            "ema_trend": self.ema_trend,
            "ema_slope": self.ema_slope,
            "price_rel_ema10": self.price_rel_ema10,
            "price_rel_ema20": self.price_rel_ema20,
            "vwap": self.vwap,
            "vwap_distance": self.vwap_distance,
            "fourier_trend": self.fourier_trend,
            "trend_score": self.trend_score,
        }


class FeaturePipeline:
    """
    Stateful Microstructure Feature Pipeline for high-frequency Binance order book & trade analysis.
    Maintains rolling buffers for z-score calculations, previous order books for OFI and depletion.
    """

    def __init__(
        self,
        lambda_param: float = 0.10,
        obi_weights: Tuple[float, float, float, float] = (0.10, 0.15, 0.30, 0.45),
        trend_weights: Tuple[float, float, float] = (0.45, 0.30, 0.25),
        rolling_window_size: int = 50,
        epsilon: float = 1e-8,
    ):
        self.lambda_param = lambda_param
        self.obi_weights = obi_weights
        self.trend_weights = trend_weights
        self.rolling_window_size = rolling_window_size
        self.epsilon = epsilon
        
        # State per symbol
        self._prev_books: Dict[str, OrderBookSnapshot] = {}
        self._prev_taker_flows: Dict[str, float] = {}
        self._ofi_history: Dict[str, List[float]] = {}
        self._taker_flow_history: Dict[str, List[float]] = {}
        self._price_impact_history: Dict[str, List[float]] = {}

    def reset(self, symbol: Optional[str] = None):
        if symbol:
            self._prev_books.pop(symbol, None)
            self._prev_taker_flows.pop(symbol, None)
            self._ofi_history.pop(symbol, None)
            self._taker_flow_history.pop(symbol, None)
            self._price_impact_history.pop(symbol, None)
        else:
            self._prev_books.clear()
            self._prev_taker_flows.clear()
            self._ofi_history.clear()
            self._taker_flow_history.clear()
            self._price_impact_history.clear()

    # -------------------------------------------------------------------------
    # 1. Depth & Spread
    # -------------------------------------------------------------------------
    def compute_depth_and_spread(
        self, bids: List[Tuple[float, float]], asks: List[Tuple[float, float]]
    ) -> Dict[str, float]:
        if not bids or not asks:
            return {
                "mid_price": 0.0,
                "spread": 0.0,
                "spread_bps": 0.0,
                "bid_depth_5": 0.0,
                "ask_depth_5": 0.0,
                "bid_depth_10": 0.0,
                "ask_depth_10": 0.0,
                "bid_depth_20": 0.0,
                "ask_depth_20": 0.0,
                "bid_depth_50": 0.0,
                "ask_depth_50": 0.0,
                "total_depth": 0.0,
                "bid_ask_ratio": 1.0,
            }

        best_bid = bids[0][0]
        best_ask = asks[0][0]
        mid_price = (best_bid + best_ask) / 2.0
        spread = max(0.0, best_ask - best_bid)
        spread_bps = (spread / (mid_price + self.epsilon)) * 10000.0

        def sum_qty(levels: List[Tuple[float, float]], k: int) -> float:
            return float(sum(qty for _, qty in levels[:k]))

        b_5 = sum_qty(bids, 5)
        a_5 = sum_qty(asks, 5)
        b_10 = sum_qty(bids, 10)
        a_10 = sum_qty(asks, 10)
        b_20 = sum_qty(bids, 20)
        a_20 = sum_qty(asks, 20)
        b_50 = sum_qty(bids, 50)
        a_50 = sum_qty(asks, 50)

        total_depth = b_50 + a_50
        bid_ask_ratio = (b_50 + self.epsilon) / (a_50 + self.epsilon)

        return {
            "mid_price": mid_price,
            "spread": spread,
            "spread_bps": spread_bps,
            "bid_depth_5": b_5,
            "ask_depth_5": a_5,
            "bid_depth_10": b_10,
            "ask_depth_10": a_10,
            "bid_depth_20": b_20,
            "ask_depth_20": a_20,
            "bid_depth_50": b_50,
            "ask_depth_50": a_50,
            "total_depth": total_depth,
            "bid_ask_ratio": bid_ask_ratio,
        }

    # -------------------------------------------------------------------------
    # 2. Multi-Level OBI
    # -------------------------------------------------------------------------
    def compute_multi_level_obi(
        self, bids: List[Tuple[float, float]], asks: List[Tuple[float, float]]
    ) -> Tuple[float, float, float, float, float]:
        """
        Calculates weighted multi-level OBI:
        OBI_K = (1 / W_K) * sum_{k=1}^K w_k * (Bid_k - Ask_k) / (Bid_k + Ask_k + eps)
        where w_k = exp(-lambda * (k - 1))
        Combined_OBI = w[0]*OBI5 + w[1]*OBI10 + w[2]*OBI20 + w[3]*OBI50
        """
        if not bids or not asks:
            return 0.0, 0.0, 0.0, 0.0, 0.0

        max_levels = min(50, len(bids), len(asks))
        if max_levels == 0:
            return 0.0, 0.0, 0.0, 0.0, 0.0

        weights_arr = np.exp(-self.lambda_param * np.arange(max_levels))
        
        # Individual level imbalances
        level_imb = []
        for i in range(max_levels):
            b_qty = bids[i][1]
            a_qty = asks[i][1]
            imb = (b_qty - a_qty) / (b_qty + a_qty + self.epsilon)
            level_imb.append(imb)
        level_imb = np.array(level_imb)

        def get_obi_k(k: int) -> float:
            actual_k = min(k, max_levels)
            if actual_k == 0:
                return 0.0
            w = weights_arr[:actual_k]
            return float(np.sum(w * level_imb[:actual_k]) / (np.sum(w) + self.epsilon))

        obi_5 = get_obi_k(5)
        obi_10 = get_obi_k(10)
        obi_20 = get_obi_k(20)
        obi_50 = get_obi_k(50)

        w0, w1, w2, w3 = self.obi_weights
        combined_obi = float(w0 * obi_5 + w1 * obi_10 + w2 * obi_20 + w3 * obi_50)
        combined_obi = float(np.clip(combined_obi, -1.0, 1.0))

        return obi_5, obi_10, obi_20, obi_50, combined_obi

    # -------------------------------------------------------------------------
    # 3. Order Flow Imbalance (OFI)
    # -------------------------------------------------------------------------
    def compute_ofi(
        self,
        symbol: str,
        curr_book: OrderBookSnapshot,
        prev_book: Optional[OrderBookSnapshot],
        total_depth: float,
    ) -> Tuple[float, float, float]:
        """
        Cont-Kukanov-Stoikov OFI formulation across best bid and ask:
        If P_bid(t) > P_bid(t-1) => delta_bid = q_bid(t)
        If P_bid(t) == P_bid(t-1) => delta_bid = q_bid(t) - q_bid(t-1)
        If P_bid(t) < P_bid(t-1) => delta_bid = -q_bid(t-1)
        
        If P_ask(t) < P_ask(t-1) => delta_ask = q_ask(t) (ask dropped = selling pressure)
        If P_ask(t) == P_ask(t-1) => delta_ask = q_ask(t) - q_ask(t-1)
        If P_ask(t) > P_ask(t-1) => delta_ask = -q_ask(t-1)
        
        Raw OFI = delta_bid - delta_ask
        Normalized OFI = Raw OFI / (TotalDepth + epsilon)
        """
        if prev_book is None or not curr_book.bids or not curr_book.asks or not prev_book.bids or not prev_book.asks:
            return 0.0, 0.0, 0.0

        p_b_curr, q_b_curr = curr_book.bids[0]
        p_b_prev, q_b_prev = prev_book.bids[0]
        p_a_curr, q_a_curr = curr_book.asks[0]
        p_a_prev, q_a_prev = prev_book.asks[0]

        # Bid delta
        if p_b_curr > p_b_prev:
            delta_bid = q_b_curr
        elif p_b_curr == p_b_prev:
            delta_bid = q_b_curr - q_b_prev
        else:
            delta_bid = -q_b_prev

        # Ask delta
        if p_a_curr < p_a_prev:
            delta_ask = q_a_curr
        elif p_a_curr == p_a_prev:
            delta_ask = q_a_curr - q_a_prev
        else:
            delta_ask = -q_a_prev

        raw_ofi = delta_bid - delta_ask
        norm_depth = max(total_depth, (q_b_curr + q_a_curr) * 5.0)
        normalized_ofi = float(raw_ofi / (norm_depth + self.epsilon))
        normalized_ofi = float(np.clip(normalized_ofi, -1.0, 1.0))

        # Rolling z-score
        history = self._ofi_history.setdefault(symbol, [])
        history.append(normalized_ofi)
        if len(history) > self.rolling_window_size:
            history.pop(0)

        if len(history) >= 5:
            mean = np.mean(history)
            std = np.std(history)
            ofi_zscore = float((normalized_ofi - mean) / (std + self.epsilon))
            ofi_zscore = float(np.clip(ofi_zscore, -3.0, 3.0))
        else:
            ofi_zscore = normalized_ofi

        return raw_ofi, normalized_ofi, ofi_zscore

    # -------------------------------------------------------------------------
    # 4. Taker Flow
    # -------------------------------------------------------------------------
    def compute_taker_flow(
        self, symbol: str, trades: List[Dict[str, Any]]
    ) -> Tuple[float, float, float, float, float, float]:
        """
        Trades: list of dicts with keys 'q' (quantity), 'm' (is_buyer_maker).
        If m is True: Buyer is maker => Seller is taker => aggressive selling.
        If m is False: Buyer is taker => aggressive buying.
        """
        if not trades:
            return 0.0, 0.0, 0.0, 1.0, 0.0, 0.0

        buy_vol = 0.0
        sell_vol = 0.0
        for t in trades:
            qty = float(t.get("q", 0.0) or t.get("qty", 0.0))
            is_maker = bool(t.get("m", False) if "m" in t else t.get("is_buyer_maker", False))
            if is_maker:
                sell_vol += qty
            else:
                buy_vol += qty

        total_vol = buy_vol + sell_vol
        taker_flow = float((buy_vol - sell_vol) / (total_vol + self.epsilon))
        taker_flow = float(np.clip(taker_flow, -1.0, 1.0))
        taker_volume_ratio = float((buy_vol + self.epsilon) / (sell_vol + self.epsilon))

        # Short term momentum
        prev_flow = self._prev_taker_flows.get(symbol, taker_flow)
        taker_flow_momentum = float(taker_flow - prev_flow)
        self._prev_taker_flows[symbol] = taker_flow

        # Rolling z-score
        history = self._taker_flow_history.setdefault(symbol, [])
        history.append(taker_flow)
        if len(history) > self.rolling_window_size:
            history.pop(0)

        if len(history) >= 5:
            mean = np.mean(history)
            std = np.std(history)
            taker_flow_zscore = float((taker_flow - mean) / (std + self.epsilon))
            taker_flow_zscore = float(np.clip(taker_flow_zscore, -3.0, 3.0))
        else:
            taker_flow_zscore = taker_flow

        return buy_vol, sell_vol, taker_flow, taker_volume_ratio, taker_flow_momentum, taker_flow_zscore

    # -------------------------------------------------------------------------
    # 5. Depth Depletion
    # -------------------------------------------------------------------------
    def compute_depth_depletion(
        self,
        curr_bids: List[Tuple[float, float]],
        prev_bids: Optional[List[Tuple[float, float]]],
        curr_asks: List[Tuple[float, float]],
        prev_asks: Optional[List[Tuple[float, float]]],
    ) -> Tuple[float, float, float]:
        """
        DepthDepletion = (PreviousDepth - CurrentDepth) / (PreviousDepth + eps)
        Ask liquidity disappearing (depletion > 0) = potentially bullish.
        Bid liquidity disappearing (depletion > 0) = potentially bearish.
        DirectionalDepth = AskDepthDepletion - BidDepthDepletion
        """
        if prev_bids is None or prev_asks is None:
            return 0.0, 0.0, 0.0

        def get_top_depth(levels: List[Tuple[float, float]], k: int = 10) -> float:
            return float(sum(qty for _, qty in levels[:k]))

        curr_b_depth = get_top_depth(curr_bids, 10)
        prev_b_depth = get_top_depth(prev_bids, 10)
        curr_a_depth = get_top_depth(curr_asks, 10)
        prev_a_depth = get_top_depth(prev_asks, 10)

        bid_depletion = float((prev_b_depth - curr_b_depth) / (prev_b_depth + self.epsilon))
        ask_depletion = float((prev_a_depth - curr_a_depth) / (prev_a_depth + self.epsilon))

        bid_depletion = float(np.clip(bid_depletion, -1.0, 1.0))
        ask_depletion = float(np.clip(ask_depletion, -1.0, 1.0))

        # Directional depth: positive when ask depleted more than bid
        directional_depth = float(ask_depletion - bid_depletion)
        directional_depth = float(np.clip(directional_depth, -1.0, 1.0))

        return bid_depletion, ask_depletion, directional_depth

    # -------------------------------------------------------------------------
    # 6. Price Impact
    # -------------------------------------------------------------------------
    def compute_price_impact(
        self, symbol: str, return_val: float, normalized_ofi: float
    ) -> Tuple[float, float, float]:
        """
        PriceImpact = abs(Return) / (abs(OFI) + eps)
        PriceImpactDirectional = sign(Return) * PriceImpact
        Normalized using rolling z-score.
        """
        abs_ret = abs(return_val)
        abs_ofi = abs(normalized_ofi)
        raw_impact = abs_ret / (abs_ofi + self.epsilon)
        directional_impact = float(np.sign(return_val) * raw_impact)

        history = self._price_impact_history.setdefault(symbol, [])
        history.append(directional_impact)
        if len(history) > self.rolling_window_size:
            history.pop(0)

        if len(history) >= 5:
            mean = np.mean(history)
            std = np.std(history)
            impact_zscore = float((directional_impact - mean) / (std + self.epsilon))
            impact_zscore = float(np.clip(impact_zscore, -3.0, 3.0))
        else:
            impact_zscore = float(np.clip(directional_impact, -3.0, 3.0))

        return raw_impact, directional_impact, impact_zscore

    # -------------------------------------------------------------------------
    # 7. Trend System (EMA 10/20, VWAP, Fourier Trend)
    # -------------------------------------------------------------------------
    def compute_trend_system(
        self, df_klines: pd.DataFrame
    ) -> Dict[str, float]:
        """
        Computes EMA10, EMA20, EMA trend, slope, VWAP, Fourier trend, and TrendScore:
        TrendScore = 0.45 * EMA_trend + 0.30 * VWAP_distance + 0.25 * Fourier_trend
        """
        default_res = {
            "ema_10": 0.0,
            "ema_20": 0.0,
            "ema_trend": 0.0,
            "ema_slope": 0.0,
            "price_rel_ema10": 0.0,
            "price_rel_ema20": 0.0,
            "vwap": 0.0,
            "vwap_distance": 0.0,
            "fourier_trend": 0.0,
            "trend_score": 0.0,
        }
        if df_klines is None or len(df_klines) < 20:
            return default_res

        closes = df_klines["close"].astype(float).values
        volumes = df_klines["volume"].astype(float).values
        highs = df_klines["high"].astype(float).values
        lows = df_klines["low"].astype(float).values
        
        curr_price = float(closes[-1])
        if curr_price <= 0:
            return default_res

        # EMAs
        ema_series_10 = pd.Series(closes).ewm(span=10, adjust=False).mean().values
        ema_series_20 = pd.Series(closes).ewm(span=20, adjust=False).mean().values

        ema_10 = float(ema_series_10[-1])
        ema_20 = float(ema_series_20[-1])

        # EMA Trend
        ema_trend = float((ema_10 - ema_20) / (curr_price + self.epsilon))
        ema_slope = float((ema_series_10[-1] - ema_series_10[-3]) / (curr_price * 2.0 + self.epsilon))

        price_rel_ema10 = float((curr_price - ema_10) / (ema_10 + self.epsilon))
        price_rel_ema20 = float((curr_price - ema_20) / (ema_20 + self.epsilon))

        # VWAP calculation
        typical_prices = (highs + lows + closes) / 3.0
        cum_tp_vol = np.sum(typical_prices * volumes)
        cum_vol = np.sum(volumes)
        vwap = float(cum_tp_vol / (cum_vol + self.epsilon)) if cum_vol > 0 else curr_price
        vwap_dist = float((curr_price - vwap) / (vwap + self.epsilon))

        # Fourier Trend (low frequency cycle decomposition)
        fourier_trend = self._calc_fourier_trend(closes)

        # Normalize components to roughly [-1, 1] range using tanh scaling
        norm_ema_trend = float(np.tanh(ema_trend * 300.0))
        norm_vwap_dist = float(np.tanh(vwap_dist * 200.0))
        norm_fourier = float(np.clip(fourier_trend, -1.0, 1.0))

        w_ema, w_vwap, w_fourier = self.trend_weights
        trend_score = float(w_ema * norm_ema_trend + w_vwap * norm_vwap_dist + w_fourier * norm_fourier)
        trend_score = float(np.clip(trend_score, -1.0, 1.0))

        return {
            "ema_10": ema_10,
            "ema_20": ema_20,
            "ema_trend": norm_ema_trend,
            "ema_slope": ema_slope,
            "price_rel_ema10": price_rel_ema10,
            "price_rel_ema20": price_rel_ema20,
            "vwap": vwap,
            "vwap_distance": norm_vwap_dist,
            "fourier_trend": norm_fourier,
            "trend_score": trend_score,
        }

    def _calc_fourier_trend(self, closes: np.ndarray) -> float:
        """
        Fast Fourier Transform extraction of dominant low-frequency trend direction.
        Returns score in [-1.0, 1.0] representing the slope/cycle direction.
        """
        n = len(closes)
        if n < 16:
            return 0.0

        # Detrend linearly first to isolate cyclical low harmonics
        x = np.arange(n)
        p = np.polyfit(x, closes, 1)
        detrended = closes - np.polyval(p, x)

        fft_vals = np.fft.rfft(detrended)
        # Zero out high frequency components (keep first 3 harmonics)
        fft_filtered = np.zeros_like(fft_vals)
        fft_filtered[1:4] = fft_vals[1:4]

        reconstructed = np.fft.irfft(fft_filtered, n=n)
        # Combined slope: linear fit slope + low frequency harmonic delta
        harmonic_slope = (reconstructed[-1] - reconstructed[-3]) / (np.std(closes) + self.epsilon)
        linear_slope = p[0] / (np.std(closes) + self.epsilon)
        composite = float(linear_slope * 0.6 + harmonic_slope * 0.4)
        return float(np.tanh(composite * 1.5))

    # -------------------------------------------------------------------------
    # Main Pipeline Execution
    # -------------------------------------------------------------------------
    def process_market_data(
        self,
        symbol: str,
        timestamp: float,
        bids: List[Tuple[float, float]],
        asks: List[Tuple[float, float]],
        trades: List[Dict[str, Any]],
        df_klines: pd.DataFrame,
    ) -> MicrostructureFeatures:
        curr_book = OrderBookSnapshot(symbol=symbol, timestamp=timestamp, bids=bids, asks=asks)
        prev_book = self._prev_books.get(symbol)

        # 1. Depth & Spread
        depth_info = self.compute_depth_and_spread(bids, asks)

        # 2. Multi-level OBI
        obi_5, obi_10, obi_20, obi_50, combined_obi = self.compute_multi_level_obi(bids, asks)

        # 3. OFI
        raw_ofi, norm_ofi, ofi_zscore = self.compute_ofi(
            symbol, curr_book, prev_book, depth_info["total_depth"]
        )

        # 4. Taker Flow
        buy_vol, sell_vol, taker_flow, taker_ratio, taker_mom, taker_zscore = self.compute_taker_flow(
            symbol, trades
        )

        # 5. Depth Depletion
        prev_bids = prev_book.bids if prev_book else None
        prev_asks = prev_book.asks if prev_book else None
        bid_dep, ask_dep, dir_depth = self.compute_depth_depletion(bids, prev_bids, asks, prev_asks)

        # 6. Price Impact
        prev_mid = prev_book.bids[0][0] if prev_book and prev_book.bids else depth_info["mid_price"]
        ret = (depth_info["mid_price"] - prev_mid) / (prev_mid + self.epsilon) if prev_mid > 0 else 0.0
        raw_impact, dir_impact, impact_zscore = self.compute_price_impact(symbol, ret, norm_ofi)

        # 7. Trend
        trend_info = self.compute_trend_system(df_klines)

        # Update previous book state
        self._prev_books[symbol] = curr_book

        return MicrostructureFeatures(
            symbol=symbol,
            timestamp=timestamp,
            mid_price=depth_info["mid_price"],
            spread=depth_info["spread"],
            spread_bps=depth_info["spread_bps"],
            bid_depth_5=depth_info["bid_depth_5"],
            ask_depth_5=depth_info["ask_depth_5"],
            bid_depth_10=depth_info["bid_depth_10"],
            ask_depth_10=depth_info["ask_depth_10"],
            bid_depth_20=depth_info["bid_depth_20"],
            ask_depth_20=depth_info["ask_depth_20"],
            bid_depth_50=depth_info["bid_depth_50"],
            ask_depth_50=depth_info["ask_depth_50"],
            total_depth=depth_info["total_depth"],
            bid_ask_ratio=depth_info["bid_ask_ratio"],
            obi_5=obi_5,
            obi_10=obi_10,
            obi_20=obi_20,
            obi_50=obi_50,
            combined_obi=combined_obi,
            raw_ofi=raw_ofi,
            normalized_ofi=norm_ofi,
            ofi_zscore=ofi_zscore,
            buy_volume=buy_vol,
            sell_volume=sell_vol,
            taker_flow=taker_flow,
            taker_volume_ratio=taker_ratio,
            taker_flow_momentum=taker_mom,
            taker_flow_zscore=taker_zscore,
            bid_depth_depletion=bid_dep,
            ask_depth_depletion=ask_dep,
            directional_depth=dir_depth,
            price_impact=raw_impact,
            price_impact_directional=dir_impact,
            price_impact_zscore=impact_zscore,
            ema_10=trend_info["ema_10"],
            ema_20=trend_info["ema_20"],
            ema_trend=trend_info["ema_trend"],
            ema_slope=trend_info["ema_slope"],
            price_rel_ema10=trend_info["price_rel_ema10"],
            price_rel_ema20=trend_info["price_rel_ema20"],
            vwap=trend_info["vwap"],
            vwap_distance=trend_info["vwap_distance"],
            fourier_trend=trend_info["fourier_trend"],
            trend_score=trend_info["trend_score"],
        )
