"""
auto_collector.py
=================
Binance Market Data Collector & Microstructure Streamer.
Pulls Top 50 Order Book levels, AggTrades, and 1m Klines from Binance Public API.
Executes the FeaturePipeline -> BigMoveEngine -> Signal Logging pipeline.
"""

import os
import time
import csv
import logging
from typing import Dict, List, Optional, Tuple, Any
import requests
import pandas as pd

from src.feature_pipeline import FeaturePipeline, OrderBookSnapshot, MicrostructureFeatures
from big_move_engine import BigMoveEngine, SignalResult, SignalType
from research_lab import MicrostructureMLModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AutoCollector")


class BinanceDataCollector:
    BASE_URL = "https://api.binance.com"

    def __init__(
        self,
        symbols: Optional[List[str]] = None,
        poll_interval: float = 3.0,
        log_csv_path: str = "data/signals_log.csv",
    ):
        self.symbols = symbols or ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT"]
        self.poll_interval = poll_interval
        self.log_csv_path = log_csv_path
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "CryptoMicrostructureEngine/1.0"})

        self.pipeline = FeaturePipeline()
        self.engine = BigMoveEngine()
        self.ml_model = MicrostructureMLModel()
        self.ml_model.load()

        self._ensure_log_file()

    def _ensure_log_file(self):
        os.makedirs(os.path.dirname(self.log_csv_path) or ".", exist_ok=True)
        if not os.path.exists(self.log_csv_path):
            headers = [
                "timestamp", "created_at", "expires_at", "symbol", "price",
                "signal", "raw_signal", "confidence", "bms", "final_score",
                "ml_long_prob", "ml_wait_prob", "ml_short_prob", "directional_agreement",
                "OBI5", "OBI10", "OBI20", "OBI50", "OFI", "TakerFlow", "DepthDepletion",
                "PriceImpact", "EMA10", "EMA20", "VWAP", "TrendScore",
                "entry_price", "stop_loss", "tp1", "tp2", "risk_flags"
            ]
            with open(self.log_csv_path, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(headers)

    def fetch_order_book(self, symbol: str, limit: int = 50) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
        try:
            url = f"{self.BASE_URL}/api/v3/depth"
            resp = self.session.get(url, params={"symbol": symbol, "limit": limit}, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                bids = [(float(p), float(q)) for p, q in data.get("bids", [])]
                asks = [(float(p), float(q)) for p, q in data.get("asks", [])]
                return bids, asks
        except Exception as e:
            logger.warning(f"Error fetching order book for {symbol}: {e}")
        return [], []

    def fetch_agg_trades(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        try:
            url = f"{self.BASE_URL}/api/v3/aggTrades"
            resp = self.session.get(url, params={"symbol": symbol, "limit": limit}, timeout=4)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning(f"Error fetching aggTrades for {symbol}: {e}")
        return []

    def fetch_klines(self, symbol: str, interval: str = "1m", limit: int = 60) -> pd.DataFrame:
        try:
            url = f"{self.BASE_URL}/api/v3/klines"
            resp = self.session.get(url, params={"symbol": symbol, "interval": interval, "limit": limit}, timeout=4)
            if resp.status_code == 200:
                raw = resp.json()
                df = pd.DataFrame(raw, columns=[
                    "open_time", "open", "high", "low", "close", "volume",
                    "close_time", "quote_volume", "trades", "taker_buy_base", "taker_buy_quote", "ignore"
                ])
                for c in ["open", "high", "low", "close", "volume"]:
                    df[c] = pd.to_numeric(df[c], errors="coerce")
                return df
        except Exception as e:
            logger.warning(f"Error fetching klines for {symbol}: {e}")
        return pd.DataFrame()

    def process_coin(self, symbol: str) -> Optional[SignalResult]:
        bids, asks = self.fetch_order_book(symbol, limit=50)
        if not bids or not asks:
            return None

        trades = self.fetch_agg_trades(symbol, limit=80)
        df_klines = self.fetch_klines(symbol, interval="1m", limit=50)

        now_ts = time.time()
        features = self.pipeline.process_market_data(
            symbol=symbol,
            timestamp=now_ts,
            bids=bids,
            asks=asks,
            trades=trades,
            df_klines=df_klines,
        )

        # ML Probabilities
        ml_probs = self.ml_model.predict_probabilities(features.to_dict())

        # Rolling ATR for stop loss
        atr = None
        if not df_klines.empty and len(df_klines) >= 14:
            tr = np.maximum(
                df_klines["high"] - df_klines["low"],
                np.maximum(
                    abs(df_klines["high"] - df_klines["close"].shift(1)),
                    abs(df_klines["low"] - df_klines["close"].shift(1)),
                ),
            )
            atr = float(tr.rolling(14).mean().iloc[-1])

        signal_res = self.engine.generate_signal(
            features=features,
            ml_probs=ml_probs,
            rolling_atr=atr,
            current_time=now_ts,
        )

        self._log_signal(signal_res, features)
        return signal_res

    def _log_signal(self, sig: SignalResult, features: MicrostructureFeatures):
        try:
            rec = sig.to_log_record(features)
            with open(self.log_csv_path, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow([
                    rec["timestamp"], rec["created_at"], rec["expires_at"], rec["symbol"], rec.get("price", 0.0),
                    rec["signal"], rec["raw_signal"], rec["confidence"], rec["bms"], rec["final_score"],
                    rec["ml_long_prob"], rec["ml_wait_prob"], rec["ml_short_prob"], rec["directional_agreement"],
                    rec.get("OBI5", 0.0), rec.get("OBI10", 0.0), rec.get("OBI20", 0.0), rec.get("OBI50", 0.0),
                    rec.get("OFI", 0.0), rec.get("TakerFlow", 0.0), rec.get("DepthDepletion", 0.0),
                    rec.get("PriceImpact", 0.0), rec.get("EMA10", 0.0), rec.get("EMA20", 0.0),
                    rec.get("VWAP", 0.0), rec.get("TrendScore", 0.0),
                    rec["entry_price"], rec["stop_loss"], rec["tp1"], rec["tp2"], rec["risk_flags"]
                ])
        except Exception as e:
            logger.warning(f"Failed to log signal to CSV: {e}")

    def run_once(self) -> Dict[str, Optional[SignalResult]]:
        results = {}
        for sym in self.symbols:
            try:
                results[sym] = self.process_coin(sym)
            except Exception as e:
                logger.error(f"Error processing {sym}: {e}")
                results[sym] = None
        return results

    def run_loop(self):
        logger.info(f"Starting continuous collector for {self.symbols}...")
        while True:
            t0 = time.time()
            self.run_once()
            elapsed = time.time() - t0
            sleep_time = max(0.5, self.poll_interval - elapsed)
            time.sleep(sleep_time)


if __name__ == "__main__":
    collector = BinanceDataCollector()
    collector.run_loop()
