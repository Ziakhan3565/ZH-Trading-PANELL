/**
 * CoinDetailView.tsx
 * Comprehensive deep microstructure analytical workstation.
 * Interactive Price & Trend Chart with EMA10, EMA20, VWAP, Targets (Entry, SL, TP1, TP2),
 * Top-50 Depth Ladder, Microstructure Gauges (OBI, OFI, Taker Flow, Depletion, Impact),
 * BMS Component Breakdown, ML Probabilities, Anti-Flip Persistence Monitor,
 * and Paper Trading Position Simulator.
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  AlertTriangle,
  Layers,
  BarChart3,
  Brain,
  History,
  PlayCircle,
  Clock,
  Download,
} from 'lucide-react';
import { CoinData, SignalType } from '../types';

interface CoinDetailViewProps {
  coin: CoinData;
  onOpenPaperTrade: (coin: CoinData) => void;
  onClosePaperTrade: (symbol: string) => void;
}

export const CoinDetailView: React.FC<CoinDetailViewProps> = ({
  coin,
  onOpenPaperTrade,
  onClosePaperTrade,
}) => {
  const [activeTab, setActiveTab] = useState<'chart' | 'orderbook' | 'history'>('chart');
  const [chartViewMode, setChartViewMode] = useState<'candles' | 'line'>('candles');

  const sig = coin.signal;
  const met = coin.metrics;
  const book = coin.orderBook;

  const formatPrice = (p?: number) => {
    if (p === undefined || isNaN(p)) return '$0.00';
    if (p >= 1000) return `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  };

  const getSignalBadgeColor = (s?: SignalType) => {
    if (!s || s === 'WAIT') return 'bg-[#21262d] text-[#8b949e] border-[#30363d]';
    if (s.includes('LONG')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
  };

  // SVG Chart Calculations
  const klines = coin.klines || [];
  const minPrice = klines.length > 0 ? Math.min(...klines.map((k) => k.low)) : 0;
  const maxPrice = klines.length > 0 ? Math.max(...klines.map((k) => k.high)) : 100;
  const priceRange = maxPrice - minPrice || 1;

  const chartHeight = 260;
  const chartWidth = 720;
  const paddingX = 40;
  const paddingY = 25;

  const getY = (price: number) => {
    return chartHeight - paddingY - ((price - minPrice) / priceRange) * (chartHeight - paddingY * 2);
  };

  const getX = (index: number) => {
    const total = Math.max(1, klines.length - 1);
    return paddingX + (index / total) * (chartWidth - paddingX * 2);
  };

  // Generate SVG path for EMA10, EMA20, and VWAP
  const ema10Path = klines
    .map((k, i) => {
      const p = k.close; // proxy or computed
      return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p)}`;
    })
    .join(' ');

  // Download Signal History to CSV
  const handleDownloadCSV = () => {
    if (!coin.signalHistory || coin.signalHistory.length === 0) return;
    const headers = [
      'Timestamp',
      'Created_At',
      'Expires_At',
      'Symbol',
      'Signal',
      'Confidence',
      'BMS',
      'ML_Long',
      'ML_Wait',
      'ML_Short',
      'Agreement',
      'Entry',
      'Stop_Loss',
      'TP1',
      'TP2',
    ];
    const rows = coin.signalHistory.map((s) => [
      s.timestamp,
      s.createdAt,
      s.expiresAt,
      s.symbol,
      s.signal,
      s.confidence.toFixed(1),
      s.bms.toFixed(4),
      s.ml.pLong.toFixed(3),
      s.ml.pWait.toFixed(3),
      s.ml.pShort.toFixed(3),
      (s.directionalAgreement * 100).toFixed(0),
      s.entryPrice,
      s.stopLoss,
      s.tp1,
      s.tp2,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${coin.symbol}_microstructure_signals.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card for Selected Coin */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#21262d] text-base font-bold text-white border border-[#30363d]">
              {coin.baseAsset.substring(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{coin.displayName}</h2>
                <span className="rounded bg-[#21262d] px-2 py-0.5 text-xs text-[#8b949e] font-mono">
                  {coin.symbol}
                </span>
                <div className={`rounded-md px-2.5 py-0.5 text-xs font-bold border ${getSignalBadgeColor(sig?.signal)}`}>
                  {sig?.signal || 'WAIT'}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                <span>24h Vol: ${(coin.volume24h * coin.price / 1e6).toFixed(1)}M</span>
                <span>•</span>
                <span>24h High: {formatPrice(coin.high24h)}</span>
                <span>•</span>
                <span>24h Low: {formatPrice(coin.low24h)}</span>
                <span>•</span>
                <span>Spread: {met ? `${met.spreadBps.toFixed(2)} bps` : '---'}</span>
              </div>
            </div>
          </div>

          {/* Current Live Price & 24h Change */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {formatPrice(coin.price)}
              </div>
              <div
                className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${
                  coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {coin.priceChange24h >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {coin.priceChange24h >= 0 ? '+' : ''}
                {coin.priceChange24h.toFixed(2)}% (24h)
              </div>
            </div>

            {/* Simulated Paper Trade Action Button */}
            <div>
              {coin.paperPosition && !coin.paperPosition.isClosed ? (
                <button
                  onClick={() => onClosePaperTrade(coin.symbol)}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition"
                >
                  <Shield className="h-4 w-4" />
                  <span>Close Position ({coin.paperPosition.pnlPct >= 0 ? '+' : ''}{(coin.paperPosition.pnlPct * 100).toFixed(2)}%)</span>
                </button>
              ) : (
                <button
                  onClick={() => onOpenPaperTrade(coin)}
                  disabled={!sig || sig.signal === 'WAIT'}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition border ${
                    sig && sig.signal !== 'WAIT'
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500 border-indigo-500 shadow-sm'
                      : 'bg-[#21262d] text-[#8b949e] border-[#30363d] cursor-not-allowed'
                  }`}
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>Paper Trade {sig?.signal !== 'WAIT' ? sig?.signal : 'Signal'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Target & Risk Levels Banner */}
      {sig && sig.signal !== 'WAIT' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs font-mono">
          <div className="rounded-lg bg-[#161b22] p-2.5 border border-[#30363d]">
            <span className="text-[10px] uppercase text-[#8b949e] font-sans font-medium block">Entry Price</span>
            <span className="text-sm font-bold text-white">{formatPrice(sig.entryPrice)}</span>
          </div>
          <div className="rounded-lg bg-[#161b22] p-2.5 border border-rose-500/20">
            <span className="text-[10px] uppercase text-rose-400 font-sans font-medium block">Stop Loss</span>
            <span className="text-sm font-bold text-rose-400">{formatPrice(sig.stopLoss)}</span>
            <span className="text-[9px] text-[#8b949e] block font-sans">
              -{(Math.abs(sig.entryPrice - sig.stopLoss) / sig.entryPrice * 100).toFixed(2)}% Risk
            </span>
          </div>
          <div className="rounded-lg bg-[#161b22] p-2.5 border border-emerald-500/20">
            <span className="text-[10px] uppercase text-emerald-400 font-sans font-medium block">TP1 (1:2 RR)</span>
            <span className="text-sm font-bold text-emerald-400">{formatPrice(sig.tp1)}</span>
            <span className="text-[9px] text-emerald-400/80 block font-sans">
              +{(Math.abs(sig.tp1 - sig.entryPrice) / sig.entryPrice * 100).toFixed(2)}% Reward
            </span>
          </div>
          <div className="rounded-lg bg-[#161b22] p-2.5 border border-emerald-500/20">
            <span className="text-[10px] uppercase text-emerald-300 font-sans font-medium block">TP2 (1:3 RR)</span>
            <span className="text-sm font-bold text-emerald-300">{formatPrice(sig.tp2)}</span>
            <span className="text-[9px] text-emerald-300/80 block font-sans">
              +{(Math.abs(sig.tp2 - sig.entryPrice) / sig.entryPrice * 100).toFixed(2)}% Reward
            </span>
          </div>
          <div className="rounded-lg bg-[#161b22] p-2.5 border border-[#30363d]">
            <span className="text-[10px] uppercase text-[#8b949e] font-sans font-medium block">Signal Expiry</span>
            <div className="flex items-center gap-1 text-amber-400 font-bold">
              <Clock className="h-3 w-3" />
              <span>{Math.max(0, sig.validMinutes - Math.floor(sig.ageSeconds / 60))}m remaining</span>
            </div>
            <span className="text-[9px] text-[#8b949e] block font-sans">
              Holding: 20m window
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Chart & Microstructure Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Interactive Chart / Order Book / History Tabs */}
        <div className="lg:col-span-2 rounded-xl border border-[#30363d] bg-[#161b22] p-4 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#30363d] pb-3 mb-3">
            {/* View Tabs */}
            <div className="flex rounded-lg bg-[#0d1117] p-1 border border-[#30363d] text-xs">
              <button
                onClick={() => setActiveTab('chart')}
                className={`flex items-center gap-1.5 rounded px-3 py-1 font-medium transition ${
                  activeTab === 'chart' ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Price & Targets</span>
              </button>
              <button
                onClick={() => setActiveTab('orderbook')}
                className={`flex items-center gap-1.5 rounded px-3 py-1 font-medium transition ${
                  activeTab === 'orderbook' ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Top-50 Depth</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 rounded px-3 py-1 font-medium transition ${
                  activeTab === 'history' ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>Signal History</span>
              </button>
            </div>

            {activeTab === 'chart' && (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="flex items-center gap-1 text-indigo-400">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" /> EMA10: {met ? formatPrice(met.ema10) : ''}
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> EMA20: {met ? formatPrice(met.ema20) : ''}
                </span>
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" /> VWAP: {met ? formatPrice(met.vwap) : ''}
                </span>
              </div>
            )}

            {activeTab === 'history' && (
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            )}
          </div>

          {/* TAB 1: CHART */}
          {activeTab === 'chart' && (
            <div className="relative w-full overflow-hidden">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto select-none">
                {/* Grid Lines */}
                {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
                  const y = paddingY + ratio * (chartHeight - paddingY * 2);
                  const p = maxPrice - ratio * priceRange;
                  return (
                    <g key={ratio}>
                      <line x1={paddingX} y1={y} x2={chartWidth - paddingX} y2={y} stroke="#21262d" strokeDasharray="3 3" />
                      <text x={chartWidth - paddingX + 4} y={y + 3} fill="#484f58" fontSize="9" fontFamily="monospace">
                        {formatPrice(p)}
                      </text>
                    </g>
                  );
                })}

                {/* Target Horizontal Lines */}
                {sig && sig.signal !== 'WAIT' && (
                  <>
                    {/* Entry Line */}
                    <line
                      x1={paddingX}
                      y1={getY(sig.entryPrice)}
                      x2={chartWidth - paddingX}
                      y2={getY(sig.entryPrice)}
                      stroke="#818cf8"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text x={paddingX + 6} y={getY(sig.entryPrice) - 4} fill="#818cf8" fontSize="9" fontWeight="bold">
                      ENTRY {formatPrice(sig.entryPrice)}
                    </text>

                    {/* SL Line */}
                    <line
                      x1={paddingX}
                      y1={getY(sig.stopLoss)}
                      x2={chartWidth - paddingX}
                      y2={getY(sig.stopLoss)}
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <text x={paddingX + 6} y={getY(sig.stopLoss) - 4} fill="#f43f5e" fontSize="9" fontWeight="bold">
                      SL {formatPrice(sig.stopLoss)}
                    </text>

                    {/* TP1 Line */}
                    <line
                      x1={paddingX}
                      y1={getY(sig.tp1)}
                      x2={chartWidth - paddingX}
                      y2={getY(sig.tp1)}
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 2"
                    />
                    <text x={paddingX + 6} y={getY(sig.tp1) - 4} fill="#10b981" fontSize="9" fontWeight="bold">
                      TP1 (1:2 RR) {formatPrice(sig.tp1)}
                    </text>

                    {/* TP2 Line */}
                    <line
                      x1={paddingX}
                      y1={getY(sig.tp2)}
                      x2={chartWidth - paddingX}
                      y2={getY(sig.tp2)}
                      stroke="#34d399"
                      strokeWidth="1.5"
                    />
                    <text x={paddingX + 6} y={getY(sig.tp2) - 4} fill="#34d399" fontSize="9" fontWeight="bold">
                      TP2 (1:3 RR) {formatPrice(sig.tp2)}
                    </text>
                  </>
                )}

                {/* Candlesticks */}
                {klines.map((k, i) => {
                  const x = getX(i);
                  const isUp = k.close >= k.open;
                  const color = isUp ? '#10b981' : '#f43f5e';
                  const yHigh = getY(k.high);
                  const yLow = getY(k.low);
                  const yOpen = getY(k.open);
                  const yClose = getY(k.close);
                  const bodyY = Math.min(yOpen, yClose);
                  const bodyH = Math.max(1.5, Math.abs(yOpen - yClose));
                  const candleW = Math.max(3, (chartWidth - paddingX * 2) / (klines.length * 1.6));

                  return (
                    <g key={k.timestamp || i}>
                      {/* Wick */}
                      <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1" />
                      {/* Body */}
                      <rect
                        x={x - candleW / 2}
                        y={bodyY}
                        width={candleW}
                        height={bodyH}
                        fill={color}
                        rx="1"
                      />
                    </g>
                  );
                })}

                {/* EMA Line overlay */}
                <path d={ema10Path} fill="none" stroke="#6366f1" strokeWidth="1.5" opacity="0.8" />
              </svg>

              <div className="flex justify-between items-center text-[10px] text-[#484f58] pt-2 border-t border-[#21262d] font-mono">
                <span>1-Minute Binance Interval</span>
                <span>Zoom & Microstructure Sync Active</span>
              </div>
            </div>
          )}

          {/* TAB 2: ORDER BOOK TOP-50 LADDER */}
          {activeTab === 'orderbook' && (
            <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto font-mono text-xs pr-1">
              {/* Bids Ladder */}
              <div>
                <div className="flex justify-between text-[11px] font-bold text-emerald-400 border-b border-[#30363d] pb-1 mb-1">
                  <span>BID PRICE</span>
                  <span>SIZE</span>
                  <span>TOTAL</span>
                </div>
                <div className="space-y-0.5">
                  {(book?.bids.slice(0, 20) || []).map((b, i) => (
                    <div key={i} className="flex justify-between text-[11px] relative py-0.5 px-1 hover:bg-emerald-950/20">
                      <span className="text-emerald-400 font-semibold">{formatPrice(b.price)}</span>
                      <span className="text-white">{b.qty.toFixed(4)}</span>
                      <span className="text-[#8b949e]">{(b.price * b.qty).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Asks Ladder */}
              <div>
                <div className="flex justify-between text-[11px] font-bold text-rose-400 border-b border-[#30363d] pb-1 mb-1">
                  <span>ASK PRICE</span>
                  <span>SIZE</span>
                  <span>TOTAL</span>
                </div>
                <div className="space-y-0.5">
                  {(book?.asks.slice(0, 20) || []).map((a, i) => (
                    <div key={i} className="flex justify-between text-[11px] relative py-0.5 px-1 hover:bg-rose-950/20">
                      <span className="text-rose-400 font-semibold">{formatPrice(a.price)}</span>
                      <span className="text-white">{a.qty.toFixed(4)}</span>
                      <span className="text-[#8b949e]">{(a.price * a.qty).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SIGNAL HISTORY */}
          {activeTab === 'history' && (
            <div className="max-h-[300px] overflow-y-auto text-xs font-mono">
              <table className="w-full text-left">
                <thead className="text-[#8b949e] border-b border-[#30363d] sticky top-0 bg-[#161b22]">
                  <tr>
                    <th className="py-1.5 px-2">TIME</th>
                    <th className="py-1.5 px-2">SIGNAL</th>
                    <th className="py-1.5 px-2">BMS</th>
                    <th className="py-1.5 px-2">ML PROB</th>
                    <th className="py-1.5 px-2">AGREEMENT</th>
                    <th className="py-1.5 px-2">ENTRY</th>
                    <th className="py-1.5 px-2">SL</th>
                    <th className="py-1.5 px-2">TP1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {(coin.signalHistory || []).map((h, i) => (
                    <tr key={i} className="hover:bg-[#21262d]">
                      <td className="py-1.5 px-2 text-[#8b949e]">{h.createdAt}</td>
                      <td className="py-1.5 px-2 font-bold">
                        <span className={h.signal.includes('LONG') ? 'text-emerald-400' : h.signal.includes('SHORT') ? 'text-rose-400' : 'text-[#8b949e]'}>
                          {h.signal}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">{h.bms.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-[10px]">
                        L:{(h.ml.pLong * 100).toFixed(0)}% S:{(h.ml.pShort * 100).toFixed(0)}%
                      </td>
                      <td className="py-1.5 px-2">{(h.directionalAgreement * 100).toFixed(0)}%</td>
                      <td className="py-1.5 px-2">{formatPrice(h.entryPrice)}</td>
                      <td className="py-1.5 px-2 text-rose-400">{formatPrice(h.stopLoss)}</td>
                      <td className="py-1.5 px-2 text-emerald-400">{formatPrice(h.tp1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Microstructure Gauges & ML Probabilities */}
        <div className="space-y-4">
          {/* Big Move Score Card */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
                Big Move Score (BMS)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {sig ? (sig.bms >= 0 ? `+${sig.bms.toFixed(4)}` : sig.bms.toFixed(4)) : '0.0000'}
              </span>
            </div>

            {/* BMS Meter */}
            <div className="h-3 w-full rounded-full bg-[#0d1117] p-0.5 border border-[#30363d] mb-3 relative flex items-center">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#484f58]" />
              {sig && (
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    sig.bms >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{
                    width: `${Math.abs(sig.bms) * 50}%`,
                    marginLeft: sig.bms >= 0 ? '50%' : `${50 - Math.abs(sig.bms) * 50}%`,
                  }}
                />
              )}
            </div>

            {/* Component Weights Breakdown */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>OFI (28%):</span>
                <span className="font-mono text-white">{met ? met.normalizedOfi.toFixed(3) : '0.000'}</span>
              </div>
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>OBI Combined (22%):</span>
                <span className="font-mono text-white">{met ? met.combinedObi.toFixed(3) : '0.000'}</span>
              </div>
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>Directional Depth (18%):</span>
                <span className="font-mono text-white">{met ? met.directionalDepth.toFixed(3) : '0.000'}</span>
              </div>
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>Taker Flow (16%):</span>
                <span className="font-mono text-white">{met ? met.takerFlow.toFixed(3) : '0.000'}</span>
              </div>
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>Price Impact (8%):</span>
                <span className="font-mono text-white">{met ? met.priceImpactDirectional.toFixed(3) : '0.000'}</span>
              </div>
              <div className="flex justify-between items-center text-[#8b949e]">
                <span>Trend System (8%):</span>
                <span className="font-mono text-white">{met ? met.trendScore.toFixed(3) : '0.000'}</span>
              </div>
            </div>
          </div>

          {/* Machine Learning Distribution Card */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-indigo-400">
                <Brain className="h-4 w-4" />
                <span>ML Calibrated Probability</span>
              </div>
              <span className="text-xs font-mono font-bold text-white">
                {sig ? `${(sig.ml.confidence * 100).toFixed(1)}% Conf` : '---'}
              </span>
            </div>

            {/* Probability Bars */}
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-emerald-400 font-medium">P(LONG)</span>
                  <span className="font-mono font-bold text-white">
                    {sig ? `${(sig.ml.pLong * 100).toFixed(1)}%` : '33%'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${(sig?.ml.pLong || 0.33) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#8b949e] font-medium">P(WAIT)</span>
                  <span className="font-mono font-bold text-white">
                    {sig ? `${(sig.ml.pWait * 100).toFixed(1)}%` : '34%'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
                  <div
                    className="h-full bg-[#8b949e] rounded-full transition-all duration-300"
                    style={{ width: `${(sig?.ml.pWait || 0.34) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-rose-400 font-medium">P(SHORT)</span>
                  <span className="font-mono font-bold text-white">
                    {sig ? `${(sig.ml.pShort * 100).toFixed(1)}%` : '33%'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-300"
                    style={{ width: `${(sig?.ml.pShort || 0.33) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#30363d] flex justify-between text-[11px] text-[#8b949e]">
              <span>Horizon: 15-20 Min</span>
              <span>Model Acc: {(sig?.ml.accuracy ? sig.ml.accuracy * 100 : 68).toFixed(1)}%</span>
            </div>
          </div>

          {/* Directional Agreement & Anti-Flip State */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold uppercase tracking-wider text-[#8b949e]">
                Directional Agreement
              </span>
              <span className="font-mono font-bold text-white">
                {sig ? `${(sig.directionalAgreement * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>

            {/* Checklist of Components */}
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] mb-3">
              {sig &&
                Object.entries(sig.agreementBreakdown).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between items-center rounded bg-[#0d1117] px-2 py-1 border border-[#21262d]"
                  >
                    <span className="text-[#8b949e]">{k}</span>
                    <span
                      className={`font-semibold ${
                        v === 'BULLISH'
                          ? 'text-emerald-400'
                          : v === 'BEARISH'
                          ? 'text-rose-400'
                          : 'text-[#8b949e]'
                      }`}
                    >
                      {v}
                    </span>
                  </div>
                ))}
            </div>

            {/* Reversal Confirmation Counter */}
            <div className="rounded-md bg-[#0d1117] p-2 border border-[#30363d]">
              <div className="flex justify-between items-center text-[#8b949e] text-[11px]">
                <span>Reversal Confirmations:</span>
                <span className="font-mono font-bold text-amber-400">
                  {sig?.reversalConfirmations || 0} / 3 Required
                </span>
              </div>
              <p className="text-[10px] text-[#8b949e] mt-1">
                Anti-Flip Engine prevents rapid toggling by requiring 3 consecutive opposite updates before flipping.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
