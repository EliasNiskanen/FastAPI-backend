import { describe, expect, it } from 'vitest'

import { percentTicks, precisionFor } from './chart'
import { kindsFor, parseMode } from './prefs'
import { isIntraday, RANGES, sourceFor } from './ranges'

describe('ranges', () => {
  it('offers 15 min, 1 day, 1 month, 1 year and all time', () => {
    expect(RANGES.map((r) => r.label)).toEqual(['15M', '1D', '1M', '1Y', 'All'])
  })

  it('picks a candle size per market', () => {
    const btc = { kind: 'crypto', symbol: 'BTC', quote: 'USDT' } as const
    const aapl = { kind: 'stock', symbol: 'AAPL' } as const
    expect(sourceFor(btc, '1m')).toEqual({ interval: '60min', limit: 720 })
    expect(sourceFor(aapl, '1m')).toEqual({ interval: 'daily', limit: 22 })
    expect(sourceFor(aapl, '1y')).toEqual({ interval: 'weekly', limit: 52 })
    expect(sourceFor(btc, 'all').interval).toBe('monthly')
  })

  it('knows which ranges show times of day', () => {
    expect(isIntraday('15m')).toBe(true)
    expect(isIntraday('1d')).toBe(true)
    expect(isIntraday('1y')).toBe(false)
  })
})

describe('prefs', () => {
  it('falls back to all for unknown modes', () => {
    expect(parseMode('crypto')).toBe('crypto')
    expect(parseMode('bonds')).toBe('all')
    expect(parseMode(null)).toBe('all')
  })

  it('maps a mode to the markets it covers', () => {
    expect(kindsFor('all')).toEqual(['stock', 'crypto'])
    expect(kindsFor('stock')).toEqual(['stock'])
  })
})

describe('chart helpers', () => {
  it('uses more decimals for cheap coins', () => {
    expect(precisionFor(98250).precision).toBe(2)
    expect(precisionFor(0.0000095).precision).toBeGreaterThanOrEqual(8)
  })

  it('makes round percent ticks that include zero and never go below -100%', () => {
    const ticks = percentTicks(-3.2, 7.9)
    expect(ticks).toContain(0)
    expect(ticks[0]).toBeLessThanOrEqual(-3.2)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(7.9)
    expect(percentTicks(-64, 705)[0]).toBe(-100)
  })
})
