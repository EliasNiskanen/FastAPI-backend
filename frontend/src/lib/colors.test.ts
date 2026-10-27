import { describe, expect, it } from 'vitest'

import { colorSlots, SERIES_COLORS } from './colors'

describe('colorSlots', () => {
  const keys = ['crypto:BTC-USDT', 'crypto:ETH-USDT', 'crypto:SOL-USDT', 'stock:AAPL', 'stock:MSFT']

  it('gives every key a distinct colour from the validated palette', () => {
    const slots = colorSlots(keys)
    expect(new Set(slots.values()).size).toBe(keys.length)
    for (const c of slots.values()) expect(SERIES_COLORS).toContain(c)
  })

  it('keeps colours stable when another asset is removed', () => {
    const before = colorSlots(keys)
    const after = colorSlots(keys.filter((k) => k !== 'crypto:ETH-USDT'))
    // Only assets that had to probe past ETH's slot could move; most keep their colour.
    const kept = [...after].filter(([k, c]) => before.get(k) === c).length
    expect(kept).toBeGreaterThanOrEqual(3)
  })
})
