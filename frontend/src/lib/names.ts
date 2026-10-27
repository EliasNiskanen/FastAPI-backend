/**
 * Display names for assets ("AAPL" -> "Apple Inc"), remembered from whatever
 * the backend has returned so far (search results, movers, market tables).
 * A tiny external store, so components re-render when a name arrives.
 */
import { useSyncExternalStore } from 'react'

import type { Asset } from './asset'

const names = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0

/** Names don't depend on the quote currency: BTC is "Bitcoin" in USDT and EUR. */
const nameKey = (asset: Asset) => `${asset.kind}:${asset.symbol}`

/** Remember the display name of an asset (ignored if empty or unchanged). */
export function rememberName(asset: Asset, name: string | null | undefined): void {
  const key = nameKey(asset)
  if (!name || names.get(key) === name) return
  names.set(key, name)
  version += 1
  listeners.forEach((l) => l())
}

/** The remembered name of an asset, or null. Re-renders when it becomes known. */
export function useAssetName(asset: Asset): string | null {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return names.get(nameKey(asset)) ?? null
}
