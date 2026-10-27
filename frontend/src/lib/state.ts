/** App state that lives outside React Query: the open asset (in the URL) and the watchlist. */
import { useCallback, useEffect, useState } from 'react'

import { assetKey, parseAssetKey, sameAsset, type Asset } from './asset'

/** Read the open asset from ?a=... in the address bar (null = no dialog open). */
function readUrlAsset(): Asset | null {
  return parseAssetKey(new URLSearchParams(window.location.search).get('a'))
}

/**
 * The asset whose chart dialog is open. Kept in the URL (?a=stock:AAPL), so a
 * chart can be bookmarked or shared, and the browser's back button closes it.
 */
export function useOpenAsset(): [Asset | null, (asset: Asset | null) => void] {
  const [asset, setAsset] = useState<Asset | null>(readUrlAsset)

  useEffect(() => {
    const onPop = () => setAsset(readUrlAsset())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const open = useCallback((next: Asset | null) => {
    setAsset((current) => {
      if (current && next && sameAsset(current, next)) return current
      const url = new URL(window.location.href)
      if (next) {
        url.searchParams.set('a', assetKey(next))
        // Opening from the page adds a history entry; switching between
        // assets inside the dialog (e.g. the quote currency) replaces it.
        if (current) window.history.replaceState(null, '', url)
        else window.history.pushState(null, '', url)
      } else {
        url.searchParams.delete('a')
        window.history.pushState(null, '', url)
      }
      return next
    })
  }, [])

  return [asset, open]
}

const WATCHLIST_KEY = 'bullbearscope.watchlist.v1'
export const MAX_WATCHLIST = 8

export const DEFAULT_WATCHLIST: Asset[] = [
  { kind: 'crypto', symbol: 'BTC', quote: 'USDT' },
  { kind: 'crypto', symbol: 'ETH', quote: 'USDT' },
  { kind: 'crypto', symbol: 'SOL', quote: 'USDT' },
  { kind: 'stock', symbol: 'AAPL' },
  { kind: 'stock', symbol: 'MSFT' },
]

/** Load the saved watchlist. Storage can be unavailable (private mode), so fall back quietly. */
function loadWatchlist(): Asset[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return DEFAULT_WATCHLIST
    const keys = JSON.parse(raw) as unknown
    if (!Array.isArray(keys)) return DEFAULT_WATCHLIST
    return keys
      .map((k) => parseAssetKey(String(k)))
      .filter((a): a is Asset => a !== null)
      .slice(0, MAX_WATCHLIST)
  } catch {
    return DEFAULT_WATCHLIST
  }
}

/** The viewer's watchlist, saved in this browser. */
export function useWatchlist() {
  const [items, setItems] = useState<Asset[]>(loadWatchlist)

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items.map(assetKey)))
    } catch {
      // Storage unavailable: the watchlist still works for this visit.
    }
  }, [items])

  const has = useCallback((asset: Asset) => items.some((a) => sameAsset(a, asset)), [items])

  const toggle = useCallback((asset: Asset) => {
    setItems((list) =>
      list.some((a) => sameAsset(a, asset))
        ? list.filter((a) => !sameAsset(a, asset))
        : [...list, asset].slice(-MAX_WATCHLIST),
    )
  }, [])

  return { items, has, toggle }
}

/** `value`, but only after it has stopped changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}
