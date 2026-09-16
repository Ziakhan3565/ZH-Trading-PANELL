/**
 * Header.tsx
 * Top navigation bar with real-time system status, active signals, paper PnL,
 * and controls for ML retraining & configuration.
 */

import React from 'react';
import { Activity, Cpu, Sliders, RefreshCw, AlertTriangle, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react';
import { CoinData } from '../types';

interface HeaderProps {
  coins: CoinData[];
  isPolling: boolean;
  setIsPolling: (val: boolean) => void;
  pollIntervalSec: number;
  setPollIntervalSec: (sec: number) => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  onOpenConfig: () => void;
  onOpenMLModal: () => void;
  totalPaperPnl: number;
}

export const Header: React.FC<HeaderProps> = ({
  coins,
  isPolling,
  setIsPolling,
  pollIntervalSec,
  setPollIntervalSec,
  onManualRefresh,
  isRefreshing,
  onOpenConfig,
  onOpenMLModal,
  totalPaperPnl,
}) => {
  const strongLongCount = coins.filter((c) => c.signal?.signal === 'STRONG LONG').length;
  const longCount = coins.filter((c) => c.signal?.signal === 'LONG').length;
  const waitCount = coins.filter((c) => c.signal?.signal === 'WAIT').length;
  const shortCount = coins.filter((c) => c.signal?.signal === 'SHORT').length;
  const strongShortCount = coins.filter((c) => c.signal?.signal === 'STRONG SHORT').length;

  const activeWarningsCount = coins.reduce(
    (acc, c) => acc + (c.signal?.riskFlags.activeList.length || 0),
    0
  );

  return (
    <header className="border-b border-[#30363d] bg-[#161b22] px-4 py-3 text-sm text-[#e6edf3]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        {/* Left: Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Activity className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                Crypto Microstructure Signal Engine
              </h1>
              <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-800/60">
                BINANCE TOP-50
              </span>
              <span className="rounded bg-indigo-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-800/60">
                15-20M SIGNALS
              </span>
            </div>
            <p className="text-xs text-[#8b949e]">
              Multi-Level OBI • OFI • Taker Flow • Depth Depletion • BMS • Time-Series ML • Anti-Flip
            </p>
          </div>
        </div>

        {/* Middle: Active Signals Pulse */}
        <div className="flex items-center gap-2 rounded-md bg-[#0d1117] px-3 py-1.5 border border-[#30363d]">
          <span className="text-xs font-medium text-[#8b949e]">Active Signals:</span>
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {strongLongCount > 0 && (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400 border border-emerald-500/30">
                {strongLongCount} STRONG LONG
              </span>
            )}
            {longCount > 0 && (
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                {longCount} LONG
              </span>
            )}
            <span className="rounded bg-[#21262d] px-1.5 py-0.5 text-[#8b949e]">
              {waitCount} WAIT
            </span>
            {shortCount > 0 && (
              <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                {shortCount} SHORT
              </span>
            )}
            {strongShortCount > 0 && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-400 border border-rose-500/30">
                {strongShortCount} STRONG SHORT
              </span>
            )}
          </div>
          {activeWarningsCount > 0 && (
            <div className="ml-2 flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{activeWarningsCount} Flags</span>
            </div>
          )}
        </div>

        {/* Right: Controls & Paper Trading Metric */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Paper PnL */}
          <div className="flex items-center gap-1.5 rounded-md bg-[#0d1117] px-2.5 py-1.5 border border-[#30363d] text-xs">
            <span className="text-[#8b949e]">Paper PnL:</span>
            <span
              className={`font-semibold flex items-center gap-0.5 ${
                totalPaperPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalPaperPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {totalPaperPnl >= 0 ? '+' : ''}
              {totalPaperPnl.toFixed(2)}%
            </span>
          </div>

          {/* Polling Toggle */}
          <div className="flex items-center rounded-md bg-[#0d1117] p-1 border border-[#30363d] text-xs">
            <button
              id="header-stream-toggle"
              onClick={() => setIsPolling(!isPolling)}
              className={`rounded px-2 py-1 font-medium transition ${
                isPolling ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#21262d] text-[#8b949e]'
              }`}
            >
              {isPolling ? '● Live Stream' : '⏸ Paused'}
            </button>
            <select
              id="header-interval-select"
              value={pollIntervalSec}
              onChange={(e) => setPollIntervalSec(Number(e.target.value))}
              className="bg-transparent px-1.5 py-1 text-xs text-[#c9d1d9] outline-none"
            >
              <option value={3} className="bg-[#161b22]">3s</option>
              <option value={5} className="bg-[#161b22]">5s</option>
              <option value={10} className="bg-[#161b22]">10s</option>
              <option value={15} className="bg-[#161b22]">15s</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            id="header-refresh-btn"
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-md bg-[#21262d] px-2.5 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] transition border border-[#30363d]"
            title="Force refresh all Binance feeds"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* ML Lab Button */}
          <button
            id="header-mllab-btn"
            onClick={onOpenMLModal}
            className="flex items-center gap-1.5 rounded-md bg-indigo-950/40 px-2.5 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-900/50 transition border border-indigo-800/40"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>ML Lab</span>
          </button>

          {/* Parameters / Config Button */}
          <button
            id="header-config-btn"
            onClick={onOpenConfig}
            className="flex items-center gap-1.5 rounded-md bg-[#21262d] px-2.5 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] transition border border-[#30363d]"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Config</span>
          </button>
        </div>
      </div>
    </header>
  );
};
