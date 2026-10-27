import { describe, expect, it } from 'vitest'

import type { PriceBar } from '../api/client'
import { percentSince, summarize } from './series'

const bar = (day: number, close: number, extra: Partial<PriceBar> = {}): PriceBar => ({
  ts: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
  ...extra,
})

describe('summarize', () => {
  it('compares the last close with the previous one', () => {
    const s = summarize([bar(1, 100), bar(2, 110, { high: 115, low: 95, volume: 42 })])!
    expect(s.last).toBe(110)
    expect(s.change).toBe(10)
    expect(s.changePercent).toBeCloseTo(10)
    expect([s.dayHigh, s.dayLow, s.dayVolume]).toEqual([115, 95, 42])
    expect([s.rangeLow, s.rangeHigh, s.rangeDays]).toEqual([95, 115, 2])
  })

  it('handles empty and single-candle series', () => {
    expect(summarize([])).toBeNull()
    expect(summarize([bar(1, 50)])!.changePercent).toBe(0)
  })
})

describe('percentSince', () => {
  it('rebases closes to percent change from the first candle in the window', () => {
    const bars = [bar(1, 50), bar(2, 100), bar(3, 110), bar(4, 90)]
    const since = Date.parse('2026-10-02T00:00:00Z') / 1000
    expect(percentSince(bars, since).map((p) => +p.value.toFixed(2))).toEqual([0, 10, -10])
  })
})
