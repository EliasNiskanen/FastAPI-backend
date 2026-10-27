/** Helpers for market list items (movers and the crypto overview). */
import type { MarketItem } from '../api/client'
import { DEFAULT_QUOTE, type Asset } from './asset'

/** The asset a list item opens. */
export function itemAsset(item: MarketItem): Asset {
  return item.asset_class === 'stock'
    ? { kind: 'stock', symbol: item.symbol }
    : { kind: 'crypto', symbol: item.symbol, quote: item.quote ?? DEFAULT_QUOTE }
}

/** Price currency of a list item. */
export function itemCurrency(item: MarketItem): string {
  return item.asset_class === 'stock' ? 'USD' : (item.quote ?? DEFAULT_QUOTE)
}
