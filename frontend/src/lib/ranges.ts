/**
 * Chart time ranges (15 min, 1 day, 1 month, 1 year, all time) and which
 * candles each one uses. Stocks and crypto differ because of their data
 * sources: Binance serves 1000 candles of any size for free, while the free
 * Alpha Vantage key returns ~100 intraday or daily candles per request, so
 * stocks switch to weekly/monthly candles sooner.
 */
import type { Interval } from '../api/hooks'
import type { Asset } from './asset'

export type RangeId = '15m' | '1d' | '1m' | '1y' | 'all'

interface Source {
  interval: Interval
  limit: number
}

export interface Range {
  id: RangeId
  label: string
  /** Used in sentences: "+4.2% in the past month". */
  phrase: string
  crypto: Source
  stock: Source
}

export const RANGES: Range[] = [
  {
    id: '15m',
    label: '15M',
    phrase: 'in the past 15 minutes',
    crypto: { interval: '1min', limit: 15 },
    stock: { interval: '1min', limit: 15 },
  },
  {
    id: '1d',
    label: '1D',
    phrase: 'in the past day',
    crypto: { interval: '5min', limit: 288 },
    stock: { interval: '5min', limit: 78 }, // one trading session
  },
  {
    id: '1m',
    label: '1M',
    phrase: 'in the past month',
    crypto: { interval: '60min', limit: 720 },
    stock: { interval: 'daily', limit: 22 },
  },
  {
    id: '1y',
    label: '1Y',
    phrase: 'in the past year',
    crypto: { interval: 'daily', limit: 365 },
    stock: { interval: 'weekly', limit: 52 },
  },
  {
    id: 'all',
    label: 'All',
    phrase: 'over all available history',
    crypto: { interval: 'monthly', limit: 1000 },
    stock: { interval: 'monthly', limit: 1000 },
  },
]

export const DEFAULT_RANGE: RangeId = '1m'

/** The candle interval and count for an asset in a range. */
export function sourceFor(asset: Asset, range: RangeId): Source {
  const r = RANGES.find((x) => x.id === range) ?? RANGES[2]
  return asset.kind === 'stock' ? r.stock : r.crypto
}

/** Intraday ranges show times on the axis; longer ones show dates. */
export function isIntraday(range: RangeId): boolean {
  return range === '15m' || range === '1d'
}

/** True for candle sizes shorter than a day (the chart then shows times of day). */
export function isIntradayInterval(interval: string): boolean {
  return interval.endsWith('min')
}

const INTERVAL_NAMES: Record<string, string> = {
  '1min': '1-minute',
  '5min': '5-minute',
  '15min': '15-minute',
  '30min': '30-minute',
  '60min': 'hourly',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
}

/** "daily", "5-minute": for sentences about candle sizes. */
export function intervalName(interval: string): string {
  return INTERVAL_NAMES[interval] ?? interval
}
