/**
 * Stock prices are paused: free stock data plans (Alpha Vantage, Twelve Data)
 * don't allow showing their data on a public website. The stock code stays in
 * place; flip this (and STOCKS_ENABLED on the backend) once a commercial data
 * licence is in place.
 */
export const STOCKS_ENABLED = false

/** One sentence for banners. */
export const STOCKS_PAUSED_SHORT =
  'Stock prices are paused for now. Crypto prices from Binance work as usual.'
