"""
bot_engine.py
==============
Paper Trading & Execution Management Engine.
Maintains paper positions, validates SL/TP1/TP2 risk targets against live prices,
and provides optional MEXC execution interface hooks while preserving research purity.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import os
import time
from typing import Dict, List, Optional, Any

from big_move_engine import SignalResult, SignalType


@dataclass
class Position:
    position_id: str
    symbol: str
    side: str  # "LONG" or "SHORT"
    entry_price: float
    current_price: float
    stop_loss: float
    tp1: float
    tp2: float
    tp1_hit: bool = False
    tp2_hit: bool = False
    is_closed: bool = False
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None
    pnl_pct: float = 0.0
    opened_at: str = ""
    closed_at: Optional[str] = None


class PaperTradingEngine:
    """
    Simulated Paper Trading Engine tracking order outcomes against live market feeds.
    """

    def __init__(self, state_file: str = "data/paper_positions.json"):
        self.state_file = state_file
        self.positions: Dict[str, Position] = {}
        self.closed_trades: List[Dict[str, Any]] = []
        self._load_state()

    def _load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    data = json.load(f)
                    self.closed_trades = data.get("closed_trades", [])
            except Exception:
                pass

    def _save_state(self):
        os.makedirs(os.path.dirname(self.state_file) or ".", exist_ok=True)
        try:
            with open(self.state_file, "w") as f:
                json.dump({
                    "closed_trades": self.closed_trades,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }, f, indent=2)
        except Exception:
            pass

    def on_signal(self, signal_res: SignalResult) -> Optional[Position]:
        """
        Opens a new simulated position if a STRONG LONG or STRONG SHORT signal is generated
        and no active position exists for this symbol.
        """
        sym = signal_res.symbol
        sig_val = signal_res.signal.value

        if "LONG" not in sig_val and "SHORT" not in sig_val:
            return None

        # Check existing active position
        if sym in self.positions and not self.positions[sym].is_closed:
            return self.positions[sym]

        side = "LONG" if "LONG" in sig_val else "SHORT"
        pos_id = f"{sym}_{int(time.time())}"
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        pos = Position(
            position_id=pos_id,
            symbol=sym,
            side=side,
            entry_price=signal_res.entry_price,
            current_price=signal_res.entry_price,
            stop_loss=signal_res.stop_loss,
            tp1=signal_res.tp1,
            tp2=signal_res.tp2,
            opened_at=now_str,
        )
        self.positions[sym] = pos
        return pos

    def update_price(self, symbol: str, current_price: float) -> Optional[Position]:
        pos = self.positions.get(symbol)
        if not pos or pos.is_closed:
            return None

        pos.current_price = current_price
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        if pos.side == "LONG":
            pos.pnl_pct = (current_price - pos.entry_price) / pos.entry_price
            if current_price <= pos.stop_loss:
                pos.is_closed = True
                pos.exit_price = current_price
                pos.exit_reason = "STOP_LOSS"
                pos.closed_at = now_str
            elif current_price >= pos.tp2:
                pos.is_closed = True
                pos.tp2_hit = True
                pos.exit_price = current_price
                pos.exit_reason = "TAKE_PROFIT_2"
                pos.closed_at = now_str
            elif current_price >= pos.tp1:
                pos.tp1_hit = True
        else:  # SHORT
            pos.pnl_pct = (pos.entry_price - current_price) / pos.entry_price
            if current_price >= pos.stop_loss:
                pos.is_closed = True
                pos.exit_price = current_price
                pos.exit_reason = "STOP_LOSS"
                pos.closed_at = now_str
            elif current_price <= pos.tp2:
                pos.is_closed = True
                pos.tp2_hit = True
                pos.exit_price = current_price
                pos.exit_reason = "TAKE_PROFIT_2"
                pos.closed_at = now_str
            elif current_price <= pos.tp1:
                pos.tp1_hit = True

        if pos.is_closed:
            self.closed_trades.append({
                "position_id": pos.position_id,
                "symbol": pos.symbol,
                "side": pos.side,
                "entry_price": pos.entry_price,
                "exit_price": pos.exit_price,
                "exit_reason": pos.exit_reason,
                "pnl_pct": round(pos.pnl_pct * 100.0, 2),
                "opened_at": pos.opened_at,
                "closed_at": pos.closed_at,
            })
            self._save_state()

        return pos


class MEXCExecutionClient:
    """
    Execution connector for MEXC API.
    Used exclusively for optional order execution without affecting Binance research data.
    """

    def __init__(self, api_key: str = "", api_secret: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.is_configured = bool(api_key and api_secret)

    def place_order(self, symbol: str, side: str, qty: float, price: Optional[float] = None) -> Dict[str, Any]:
        if not self.is_configured:
            return {"status": "MOCK_EXECUTED", "symbol": symbol, "side": side, "qty": qty, "price": price}
        # Production MEXC signature logic would be placed here
        return {"status": "SUCCESS", "symbol": symbol, "side": side}
