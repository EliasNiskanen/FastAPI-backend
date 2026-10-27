/** Calculations on candle series. */
import type { PriceBar } from '../api/client'

/** Summary numbers for the latest daily candle compared with the one before. */
export interface DailySummary {
  last: number
  change: number
  changePercent: number
  dayHigh: number
  dayLow: number
  dayVolume: number
  rangeHigh: number
  rangeLow: number
  rangeDays: number
  asOf: string
}

/** Latest price, change vs previous close, today's range and the range of all loaded days. */
export function summarize(bars: PriceBar[]): DailySummary | null {
  const last = bars.at(-1)
  if (!last) return null
  const prev = bars.at(-2)
  const change = prev ? last.close - prev.close : 0
  return {
    last: last.close,
    change,
    changePercent: prev && prev.close !== 0 ? (change / prev.close) * 100 : 0,
    dayHigh: last.high,
    dayLow: last.low,
    dayVolume: last.volume,
    rangeHigh: Math.max(...bars.map((b) => b.high)),
    rangeLow: Math.min(...bars.map((b) => b.low)),
    rangeDays: bars.length,
    asOf: last.ts,
  }
}

/** A point on a percent-change line. */
export interface PercentPoint {
  time: number // unix seconds
  value: number // % change since the first point
}

/**
 * Closing prices as percent change since the first candle on or after `since`.
 * Putting every asset on this common base makes very different prices
 * (a $0.20 coin and a $500 stock) comparable on one axis.
 */
export function percentSince(bars: PriceBar[], since: number): PercentPoint[] {
  const window = bars.filter((b) => Date.parse(b.ts) / 1000 >= since)
  const base = window[0]?.close
  if (!base) return []
  return window.map((b) => ({
    time: Date.parse(b.ts) / 1000,
    value: (b.close / base - 1) * 100,
  }))
}

/** Closing prices of the last `count` candles, for sparklines. */
export function lastCloses(bars: PriceBar[], count: number): number[] {
  return bars.slice(-count).map((b) => b.close)
}

/** Numbers for a whole range of candles: first open, extremes, last close and total volume. */
export interface RangeSummary {
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
  changePercent: number
  from: string
  to: string
}

/** Summarize the candles shown in a chart. */
export function summarizeRange(bars: PriceBar[]): RangeSummary | null {
  const first = bars[0]
  const last = bars.at(-1)
  if (!first || !last) return null
  const change = last.close - first.open
  return {
    open: first.open,
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
    close: last.close,
    volume: bars.reduce((sum, b) => sum + b.volume, 0),
    change,
    changePercent: first.open !== 0 ? (change / first.open) * 100 : 0,
    from: first.ts,
    to: last.ts,
  }
}

/** Closing prices as percent change since the first candle (for comparison lines). */
export function percentFromStart(bars: PriceBar[]): PercentPoint[] {
  return bars.length ? percentSince(bars, Date.parse(bars[0].ts) / 1000) : []
}
