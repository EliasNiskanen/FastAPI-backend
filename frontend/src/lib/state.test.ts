import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_WATCHLIST, useWatchlist } from './state'

describe('useWatchlist', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts with the default list', () => {
    const { result } = renderHook(() => useWatchlist())
    expect(result.current.items).toEqual(DEFAULT_WATCHLIST)
  })

  it('adds and removes assets and saves them in the browser', () => {
    const { result } = renderHook(() => useWatchlist())
    const tsla = { kind: 'stock' as const, symbol: 'TSLA' }
    act(() => result.current.toggle(tsla))
    expect(result.current.has(tsla)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem('redline.watchlist.v1')!)).toContain('stock:TSLA')

    act(() => result.current.toggle(tsla))
    expect(result.current.has(tsla)).toBe(false)
  })

  it('ignores corrupted saved data', () => {
    window.localStorage.setItem('redline.watchlist.v1', '{not json')
    const { result } = renderHook(() => useWatchlist())
    expect(result.current.items).toEqual(DEFAULT_WATCHLIST)
  })
})
