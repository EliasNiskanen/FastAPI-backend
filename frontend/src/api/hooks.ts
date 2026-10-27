/**
 * TanStack Query hooks: one per backend endpoint. They handle caching,
 * loading and error states, and de-duplicate requests, so several panels
 * showing the same asset share one network call.
 */
import { keepPreviousData, queryOptions, useQueries, useQuery } from '@tanstack/react-query'

import type { Asset } from '../lib/asset'
import {
  getJson,
  type CryptoOverviewOut,
  type MoversOut,
  type PriceSeriesOut,
  type SearchOut,
} from './client'

export type Interval = '1min' | '5min' | '15min' | '60min' | 'daily' | 'weekly' | 'monthly'

const MINUTE = 60_000

/** Never retry "not found" or "quota used up": retrying cannot help and wastes quota. */
function retry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number }).status ?? 0
  return status !== 404 && status !== 503 && status !== 422 && failureCount < 2
}

/** Today's biggest gainers and losers for stocks or crypto. */
export function useMovers(kind: Asset['kind'], limit = 8) {
  return useQuery({
    queryKey: ['movers', kind, limit],
    queryFn: ({ signal }) =>
      getJson<MoversOut>('/api/market/movers', { asset_class: kind, limit }, signal),
    staleTime: (kind === 'crypto' ? 2 : 30) * MINUTE,
    retry,
  })
}

/** 24h stats for a set of coins (default: the major coins). */
export function useCryptoOverview(symbols?: string[]) {
  return useQuery({
    queryKey: ['crypto-overview', symbols?.join(',') ?? ''],
    queryFn: ({ signal }) =>
      getJson<CryptoOverviewOut>(
        '/api/market/crypto',
        { symbols: symbols?.length ? symbols.join(',') : undefined },
        signal,
      ),
    staleTime: 2 * MINUTE,
    refetchInterval: 5 * MINUTE,
    retry,
  })
}

/** Query definition for an asset's candles; shared by useBars and useManyDailyBars. */
function barsQuery(asset: Asset | null, interval: Interval, limit: number) {
  return queryOptions({
    queryKey: [
      'bars',
      asset?.kind,
      asset?.symbol,
      asset?.kind === 'crypto' ? asset.quote : '',
      interval,
      limit,
    ],
    queryFn: ({ signal }) => {
      if (!asset) throw new Error('No asset')
      return asset.kind === 'stock'
        ? getJson<PriceSeriesOut>(
            `/api/stocks/${encodeURIComponent(asset.symbol)}`,
            { interval, limit },
            signal,
          )
        : getJson<PriceSeriesOut>(
            `/api/crypto/${encodeURIComponent(asset.symbol)}`,
            { quote: asset.quote, interval, limit },
            signal,
          )
    },
    enabled: asset !== null,
    // Stocks are refreshed by the backend every few hours (free API quota);
    // crypto every few minutes.
    staleTime: (asset?.kind === 'crypto' ? 2 : 15) * MINUTE,
    retry,
  })
}

/** Price candles for an asset, oldest first. Keeps showing the previous data while switching. */
export function useBars(asset: Asset | null, interval: Interval, limit: number) {
  return useQuery({ ...barsQuery(asset, interval, limit), placeholderData: keepPreviousData })
}

/** How many daily candles every panel asks for, so they all share one request per asset. */
export const DAILY_LIMIT = 120

/** Daily candles, shared by the summary, watchlist sparklines and comparison chart. */
export function useDailyBars(asset: Asset | null) {
  return useBars(asset, 'daily', DAILY_LIMIT)
}

/** Daily candles for several assets at once (one request each, shared with other panels). */
export function useManyDailyBars(assets: Asset[]) {
  return useQueries({ queries: assets.map((a) => barsQuery(a, 'daily', DAILY_LIMIT)) })
}

/** Search stocks and coins by ticker or name. */
export function useSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['search', q.toLowerCase()],
    queryFn: ({ signal }) => getJson<SearchOut>('/api/search', { q, limit: 8 }, signal),
    enabled: q.length > 0,
    staleTime: 10 * MINUTE,
    placeholderData: keepPreviousData,
    retry,
  })
}
