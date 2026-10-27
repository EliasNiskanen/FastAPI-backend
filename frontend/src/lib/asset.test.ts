import { describe, expect, it } from 'vitest'

import { assetKey, assetLabel, parseAssetKey, sameAsset, type Asset } from './asset'

describe('asset keys', () => {
  it('round-trips stocks and crypto pairs', () => {
    const assets: Asset[] = [
      { kind: 'stock', symbol: 'BRK.B' },
      { kind: 'crypto', symbol: 'BTC', quote: 'EUR' },
    ]
    for (const a of assets) expect(parseAssetKey(assetKey(a))).toEqual(a)
  })

  it('is case-insensitive', () => {
    expect(parseAssetKey('crypto:eth-usdt')).toEqual({
      kind: 'crypto',
      symbol: 'ETH',
      quote: 'USDT',
    })
  })

  it.each(['', 'stock:', 'crypto:BTC', 'bond:AAPL', 'stock:AA PL', 'crypto:BTC-US$', null])(
    'rejects malformed key %s',
    (key) => {
      expect(parseAssetKey(key)).toBeNull()
    },
  )

  it('treats different quote currencies as different assets', () => {
    expect(
      sameAsset(
        { kind: 'crypto', symbol: 'BTC', quote: 'USDT' },
        { kind: 'crypto', symbol: 'BTC', quote: 'EUR' },
      ),
    ).toBe(false)
    expect(assetLabel({ kind: 'crypto', symbol: 'BTC', quote: 'EUR' })).toBe('BTC/EUR')
  })
})
