/**
 * Typed HTTP client for the backend. Response types come from the backend's
 * OpenAPI schema (src/api/schema.d.ts, generated with `npm run gen:api`), so a
 * change in the backend's response shape becomes a type error here.
 */
import { API_URL } from '../config'
import type { components } from './schema'

export type MarketItem = components['schemas']['MarketItem']
export type MoversOut = components['schemas']['MoversOut']
export type CryptoOverviewOut = components['schemas']['CryptoOverviewOut']
export type PriceSeriesOut = components['schemas']['PriceSeriesOut']
export type PriceBar = components['schemas']['PriceBarOut']
export type SearchOut = components['schemas']['SearchOut']
export type SearchResult = components['schemas']['SearchResult']

/** An error response from the backend, with its HTTP status and message. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  /** The data provider's request quota is used up (backend answers 503). */
  get isRateLimited(): boolean {
    return this.status === 503
  }

  /** The symbol does not exist at the provider. */
  get isNotFound(): boolean {
    return this.status === 404
  }
}

type Query = Record<string, string | number | undefined>

/** GET a backend path and parse the JSON body, throwing ApiError on HTTP errors. */
export async function getJson<T>(
  path: string,
  query: Query = {},
  signal?: AbortSignal,
): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}${qs ? `?${qs}` : ''}`, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // Non-JSON error body: keep the status text.
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}
