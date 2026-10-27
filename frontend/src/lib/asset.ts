/**
 * The app's notion of "a thing you can look at": a US stock or a crypto pair.
 * Assets are written as compact keys ("stock:AAPL", "crypto:BTC-USDT") in the
 * URL and in the saved watchlist.
 */
export type Asset =
  { kind: 'stock'; symbol: string } | { kind: 'crypto'; symbol: string; quote: string }

export const DEFAULT_QUOTE = 'USDT'

/** Turn an asset into its compact key, e.g. "crypto:BTC-USDT". */
export function assetKey(asset: Asset): string {
  return asset.kind === 'stock' ? `stock:${asset.symbol}` : `crypto:${asset.symbol}-${asset.quote}`
}

const STOCK = /^[A-Z0-9.-]{1,32}$/
const COIN = /^[A-Z0-9]{2,12}$/

/** Parse a compact key back into an asset; returns null for anything malformed. */
export function parseAssetKey(key: string | null | undefined): Asset | null {
  const [kind, rest = ''] = (key ?? '').split(':', 2)
  const value = rest.toUpperCase()
  if (kind?.toLowerCase() === 'stock' && STOCK.test(value)) {
    return { kind: 'stock', symbol: value }
  }
  if (kind?.toLowerCase() === 'crypto') {
    const [symbol = '', quote = ''] = value.split('-')
    if (COIN.test(symbol) && COIN.test(quote)) return { kind: 'crypto', symbol, quote }
  }
  return null
}

/** Same asset? (Keys compare both kind and quote currency.) */
export function sameAsset(a: Asset, b: Asset): boolean {
  return assetKey(a) === assetKey(b)
}

/** Short label for headings and chips: "AAPL" or "BTC/USDT". */
export function assetLabel(asset: Asset): string {
  return asset.kind === 'stock' ? asset.symbol : `${asset.symbol}/${asset.quote}`
}

/** Currency the asset's prices are in, for formatting. */
export function priceCurrency(asset: Asset): string {
  return asset.kind === 'stock' ? 'USD' : asset.quote
}
