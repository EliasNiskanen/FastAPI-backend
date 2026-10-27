import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, getJson } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('getJson', () => {
  it('builds the query string and parses JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      getJson('/api/search', { q: 'apple', limit: 8, skip: undefined }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=apple&limit=8', expect.anything())
  })

  it('turns error responses into ApiError with the backend message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: 'Market data provider rate limit reached' }), {
            status: 503,
          }),
      ),
    )
    const error = await getJson('/api/stocks/IBM').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isRateLimited).toBe(true)
    expect((error as ApiError).message).toBe('Market data provider rate limit reached')
  })

  it('reports network failures as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const error = (await getJson('/api/market/movers').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(0)
  })
})
