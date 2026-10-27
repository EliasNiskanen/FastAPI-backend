import { describe, expect, it } from 'vitest'

import { formatChange, formatCompact, formatPercent, formatPrice } from './format'

describe('formatPrice', () => {
  it('uses currency signs and thousands separators', () => {
    expect(formatPrice(98250, 'USDT')).toBe('$98,250.00')
    expect(formatPrice(90390.5, 'EUR')).toBe('€90,390.50')
    expect(formatPrice(228, 'USD')).toBe('$228.00')
  })

  it('keeps significant digits for tiny prices', () => {
    expect(formatPrice(0.0000182, 'USDT')).toBe('$0.0000182')
    expect(formatPrice(0.58, 'USDT')).toBe('$0.58')
  })

  it('writes other quote currencies after the number', () => {
    expect(formatPrice(0.052, 'BTC')).toBe('0.052 BTC')
  })
})

describe('formatPercent and formatChange', () => {
  it('sign every value, with a real minus sign', () => {
    expect(formatPercent(8.4)).toBe('+8.40%')
    expect(formatPercent(-4.449)).toBe('−4.45%')
    expect(formatPercent(0)).toBe('0.00%')
    expect(formatChange(-215.1)).toBe('−215.10')
  })
})

describe('formatCompact', () => {
  it('shortens large numbers', () => {
    expect(formatCompact(1_906_967_217)).toBe('1.9B')
    expect(formatCompact(19_721_216)).toBe('19.7M')
  })
})
