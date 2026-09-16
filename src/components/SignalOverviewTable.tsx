/**
 * SignalOverviewTable.tsx
 * Comprehensive multi-coin overview table displaying real-time Binance Order Book,
 * BMS, ML Probability, Trend, Microstructure indicators, and Entry/SL/TP targets.
 */

import React, { useState } from 'react';
import { ArrowUpDown, AlertCircle, ShieldAlert, CheckCircle2, Clock, ChevronRight, Search } from 'lucide-react';
import { CoinData, SignalType } from '../types';

interface SignalOverviewTableProps {
  coins: CoinData[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
}

type SortField = 'symbol' | 'price' | 'signal' | 'confidence' | 'bms' | 'mlScore' | 'combinedObi' | 'normalizedOfi' | 'trendScore' | 'ageSeconds';

export const SignalOverviewTable: React.FC<SignalOverviewTableProps> = ({
  coins,
  selectedSymbol,
  onSelectCoin,
}) => {
  const [filterSignal, setFilterSignal] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getSignalBadge = (sig?: SignalType) => {
    if (!sig || sig === 'WAIT') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-[#21262d] px-2 py-0.5 text-xs font-semibold text-[#8b949e] border border-[#30363d]">
          WAIT
        </span>
      );
    }
    if (sig === 'STRONG LONG') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/10">
          <CheckCircle2 className="h-3 w-3" />
          STRONG LONG
        </span>
      );
    }
    if (sig === 'LONG') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
          LONG
        </span>
      );
    }
    if (sig === 'STRONG SHORT') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-400 border border-rose-500/40 shadow-sm shadow-rose-500/10">
          <ShieldAlert className="h-3 w-3" />
          STRONG SHORT
        </span>
      );
    }
    if (sig === 'SHORT') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/20">
          SHORT
        </span>
      );
    }
    return null;
  };

  const formatPrice = (price: number): string => {
    if (!price || isNaN(price)) return '$0.00';
    if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
  };

  const formatAge = (seconds: number = 0): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Filtering & Sorting
  const filteredCoins = coins.filter((coin) => {
    const matchesSearch =
      coin.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      coin.displayName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterSignal === 'ALL') return true;
    if (filterSignal === 'LONGS') return coin.signal?.signal.includes('LONG');
    if (filterSignal === 'SHORTS') return coin.signal?.signal.includes('SHORT');
    if (filterSignal === 'STRONG') return coin.signal?.signal.includes('STRONG');
    if (filterSignal === 'WAIT') return coin.signal?.signal === 'WAIT';
    return true;
  });

  const sortedCoins = [...filteredCoins].sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;

    switch (sortField) {
      case 'symbol':
        valA = a.symbol;
        valB = b.symbol;
        break;
      case 'price':
        valA = a.price;
        valB = b.price;
        break;
      case 'signal':
        valA = a.signal?.signal || '';
        valB = b.signal?.signal || '';
        break;
      case 'confidence':
        valA = a.signal?.confidence || 0;
        valB = b.signal?.confidence || 0;
        break;
      case 'bms':
        valA = a.signal?.bms || 0;
        valB = b.signal?.bms || 0;
        break;
      case 'mlScore':
        valA = a.signal?.ml.mlScore || 0;
        valB = b.signal?.ml.mlScore || 0;
        break;
      case 'combinedObi':
        valA = a.metrics?.combinedObi || 0;
        valB = b.metrics?.combinedObi || 0;
        break;
      case 'normalizedOfi':
        valA = a.metrics?.normalizedOfi || 0;
        valB = b.metrics?.normalizedOfi || 0;
        break;
      case 'trendScore':
        valA = a.metrics?.trendScore || 0;
        valB = b.metrics?.trendScore || 0;
        break;
      case 'ageSeconds':
        valA = a.signal?.ageSeconds || 0;
        valB = b.signal?.ageSeconds || 0;
        break;
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] shadow-sm overflow-hidden">
      {/* Table Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Monitored Crypto Assets</h2>
          <span className="rounded-full bg-[#21262d] px-2 py-0.5 text-xs text-[#8b949e]">
            {coins.length} pairs
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Signal Filter */}
          <div className="flex rounded-lg bg-[#0d1117] p-1 border border-[#30363d] text-xs">
            {(['ALL', 'LONGS', 'SHORTS', 'STRONG', 'WAIT'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterSignal(mode)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  filterSignal === mode
                    ? 'bg-[#30363d] text-white shadow-xs'
                    : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search coin..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 rounded-md bg-[#0d1117] py-1.5 pl-8 pr-2.5 text-xs text-[#c9d1d9] placeholder-[#484f58] border border-[#30363d] focus:border-indigo-500 focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#0d1117]/60 text-[11px] font-semibold text-[#8b949e] tracking-wider">
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">COIN <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('price')}>
                <div className="flex items-center gap-1">PRICE <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('signal')}>
                <div className="flex items-center gap-1">SIGNAL <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('confidence')}>
                <div className="flex items-center gap-1">CONF <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('bms')}>
                <div className="flex items-center gap-1" title="Big Move Score">BMS <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('mlScore')}>
                <div className="flex items-center gap-1" title="ML: P(LONG) - P(SHORT)">ML PROB <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('combinedObi')}>
                <div className="flex items-center gap-1" title="Combined Multi-Level OBI">OBI <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('normalizedOfi')}>
                <div className="flex items-center gap-1" title="Normalized Order Flow Imbalance">OFI <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('trendScore')}>
                <div className="flex items-center gap-1" title="EMA + VWAP + Fourier Trend">TREND <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5">ENTRY</th>
              <th className="px-3 py-2.5 text-rose-400">SL</th>
              <th className="px-3 py-2.5 text-emerald-400">TP1 (1:2)</th>
              <th className="px-3 py-2.5 text-emerald-300">TP2 (1:3)</th>
              <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('ageSeconds')}>
                <div className="flex items-center gap-1">AGE <ArrowUpDown className="h-3 w-3" /></div>
              </th>
              <th className="px-3 py-2.5">RISK FLAGS</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262d]/60 bg-[#161b22]">
            {sortedCoins.map((coin) => {
              const sig = coin.signal;
              const met = coin.metrics;
              const isSelected = coin.symbol === selectedSymbol;

              const bmsColor =
                (sig?.bms || 0) > 0.35
                  ? 'text-emerald-400 font-bold'
                  : (sig?.bms || 0) < -0.35
                  ? 'text-rose-400 font-bold'
                  : 'text-[#8b949e]';

              const obiColor =
                (met?.combinedObi || 0) > 0.15
                  ? 'text-emerald-400'
                  : (met?.combinedObi || 0) < -0.15
                  ? 'text-rose-400'
                  : 'text-[#8b949e]';

              const ofiColor =
                (met?.normalizedOfi || 0) > 0.10
                  ? 'text-emerald-400'
                  : (met?.normalizedOfi || 0) < -0.10
                  ? 'text-rose-400'
                  : 'text-[#8b949e]';

              const trendColor =
                (met?.trendScore || 0) > 0.15
                  ? 'text-emerald-400'
                  : (met?.trendScore || 0) < -0.15
                  ? 'text-rose-400'
                  : 'text-[#8b949e]';

              return (
                <tr
                  key={coin.symbol}
                  id={`row-${coin.symbol}`}
                  onClick={() => onSelectCoin(coin.symbol)}
                  className={`cursor-pointer transition hover:bg-[#21262d] ${
                    isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                  }`}
                >
                  {/* Coin */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 font-sans font-semibold text-white">
                      <span>{coin.displayName}</span>
                      <span className="text-[10px] text-[#8b949e] font-mono">{coin.symbol}</span>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-3">
                    <div className="font-bold text-white">{formatPrice(coin.price)}</div>
                    <div
                      className={`text-[10px] ${
                        coin.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {coin.priceChange24h >= 0 ? '+' : ''}
                      {coin.priceChange24h.toFixed(2)}%
                    </div>
                  </td>

                  {/* Signal */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    {getSignalBadge(sig?.signal)}
                  </td>

                  {/* Confidence */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white">
                        {sig ? `${sig.confidence.toFixed(1)}%` : '---'}
                      </span>
                      {sig && (
                        <div className="h-1.5 w-12 rounded-full bg-[#21262d] overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${sig.confidence}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* BMS */}
                  <td className={`px-3 py-3 ${bmsColor}`}>
                    {sig ? (sig.bms >= 0 ? `+${sig.bms.toFixed(3)}` : sig.bms.toFixed(3)) : '---'}
                  </td>

                  {/* ML Prob */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    {sig ? (
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-emerald-400 font-semibold">
                          L:{(sig.ml.pLong * 100).toFixed(0)}%
                        </span>
                        <span className="text-[#8b949e]">
                          W:{(sig.ml.pWait * 100).toFixed(0)}%
                        </span>
                        <span className="text-rose-400 font-semibold">
                          S:{(sig.ml.pShort * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      '---'
                    )}
                  </td>

                  {/* OBI */}
                  <td className={`px-3 py-3 ${obiColor}`}>
                    {met ? (met.combinedObi >= 0 ? `+${met.combinedObi.toFixed(2)}` : met.combinedObi.toFixed(2)) : '---'}
                  </td>

                  {/* OFI */}
                  <td className={`px-3 py-3 ${ofiColor}`}>
                    {met ? (met.normalizedOfi >= 0 ? `+${met.normalizedOfi.toFixed(2)}` : met.normalizedOfi.toFixed(2)) : '---'}
                  </td>

                  {/* Trend */}
                  <td className={`px-3 py-3 ${trendColor}`}>
                    {met ? (met.trendScore >= 0 ? `+${met.trendScore.toFixed(2)}` : met.trendScore.toFixed(2)) : '---'}
                  </td>

                  {/* Entry */}
                  <td className="px-3 py-3 text-[#c9d1d9]">
                    {sig ? formatPrice(sig.entryPrice) : '---'}
                  </td>

                  {/* SL */}
                  <td className="px-3 py-3 text-rose-400">
                    {sig ? formatPrice(sig.stopLoss) : '---'}
                  </td>

                  {/* TP1 */}
                  <td className="px-3 py-3 text-emerald-400">
                    {sig ? formatPrice(sig.tp1) : '---'}
                  </td>

                  {/* TP2 */}
                  <td className="px-3 py-3 text-emerald-300">
                    {sig ? formatPrice(sig.tp2) : '---'}
                  </td>

                  {/* Age */}
                  <td className="px-3 py-3 whitespace-nowrap text-[#8b949e]">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{sig ? formatAge(sig.ageSeconds) : '0s'}</span>
                    </div>
                  </td>

                  {/* Risk Flags */}
                  <td className="px-3 py-3">
                    {sig && sig.riskFlags.activeList.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {sig.riskFlags.activeList.slice(0, 2).map((flag) => (
                          <span
                            key={flag}
                            className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-medium text-amber-400 border border-amber-500/20"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-emerald-500/80">CLEAN</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-2 py-3 text-right">
                    <ChevronRight className={`h-4 w-4 text-[#8b949e] ${isSelected ? 'text-indigo-400' : ''}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
