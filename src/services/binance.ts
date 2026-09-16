/**
 * binance.ts
 * Real-time Binance REST API service for Order Book Top-50, AggTrades, Klines, and 24h Tickers.
 */

import { AggTrade, Kline, OrderBookSnapshot } from '../types';

const BINANCE_BASE_URL = 'https://api.binance.com';

export class BinanceService {
  private static async request<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${BINANCE_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetches Top-50 Order Book levels
   */
  public static async getOrderBook(symbol: string, limit: number = 50): Promise<OrderBookSnapshot> {
    interface RawDepth {
      lastUpdateId: number;
      bids: [string, string][];
      asks: [string, string][];
    }

    const data = await this.request<RawDepth>('/api/v3/depth', {
      symbol,
      limit,
    });

    const bids = data.bids.map(([price, qty]) => ({
      price: parseFloat(price),
      qty: parseFloat(qty),
    }));

    const asks = data.asks.map(([price, qty]) => ({
      price: parseFloat(price),
      qty: parseFloat(qty),
    }));

    return {
      symbol,
      timestamp: Date.now(),
      bids,
      asks,
    };
  }

  /**
   * Fetches recent aggTrades for aggressive buyer/seller flow
   */
  public static async getAggTrades(symbol: string, limit: number = 100): Promise<AggTrade[]> {
    interface RawAggTrade {
      a: number; // trade id
      p: string; // price
      q: string; // quantity
      f: number;
      l: number;
      T: number; // timestamp
      m: boolean; // is buyer maker
      M: boolean;
    }

    const data = await this.request<RawAggTrade[]>('/api/v3/aggTrades', {
      symbol,
      limit,
    });

    return data.map((t) => ({
      id: t.a,
      price: parseFloat(t.p),
      qty: parseFloat(t.q),
      isBuyerMaker: t.m,
      timestamp: t.T,
    }));
  }

  /**
   * Fetches 1-minute OHLCV klines for trend and volatility analysis
   */
  public static async getKlines(symbol: string, interval: string = '1m', limit: number = 60): Promise<Kline[]> {
    type RawKline = [
      number, // 0: Open time
      string, // 1: Open
      string, // 2: High
      string, // 3: Low
      string, // 4: Close
      string, // 5: Volume
      number, // 6: Close time
      string, // 7: Quote asset volume
      number, // 8: Number of trades
      string, // 9: Taker buy base asset volume
      string, // 10: Taker buy quote asset volume
      string  // 11: Ignore
    ];

    const data = await this.request<RawKline[]>('/api/v3/klines', {
      symbol,
      interval,
      limit,
    });

    return data.map((k) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /**
   * Fetches 24h ticker for 24h change & high/low
   */
  public static async get24hTicker(symbol: string): Promise<{
    price: number;
    priceChange24h: number;
    volume24h: number;
    high24h: number;
    low24h: number;
  }> {
    interface RawTicker {
      lastPrice: string;
      priceChangePercent: string;
      volume: string;
      highPrice: string;
      lowPrice: string;
    }

    const data = await this.request<RawTicker>('/api/v3/ticker/24hr', {
      symbol,
    });

    return {
      price: parseFloat(data.lastPrice),
      priceChange24h: parseFloat(data.priceChangePercent),
      volume24h: parseFloat(data.volume),
      high24h: parseFloat(data.highPrice),
      low24h: parseFloat(data.lowPrice),
    };
  }
}
