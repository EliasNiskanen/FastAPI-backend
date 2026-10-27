/** Turn a failed request into a sentence that tells the viewer what happened and what to do. */
import { ApiError } from '../api/client'

export function errorMessage(error: unknown, what: string): string {
  if (error instanceof ApiError) {
    if (error.isNotFound) return `No ${what} found for this symbol.`
    if (error.isRateLimited)
      return `The free stock data quota is used up for today and nothing is saved for this one yet, so ${what} can't load right now. Crypto works all the time; stocks again after the quota resets.`
    if (error.status === 0) return error.message
  }
  return `${what[0].toUpperCase()}${what.slice(1)} couldn't load. Try again in a moment.`
}

/** True when the backend answered with saved data because the provider was unavailable. */
export const STALE_NOTE = 'Showing saved data: the provider is not answering right now.'
