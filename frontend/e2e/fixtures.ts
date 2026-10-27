/**
 * Canned backend responses for end-to-end tests. Every /api request from the
 * browser is answered here, so the tests run without a backend, database or
 * API keys, and always see the same data.
 */
import type { Page, Route } from '@playwright/test'

const item = (symbol: string, name: string, price: number, pct: number, kind = 'crypto') => ({
  asset_class: kind,
  symbol,
  name,
  quote: kind === 'crypto' ? 'USDT' : null,
  price,
  change: (price * pct) / 100,
  change_percent: pct,
  volume: 1e9,
  high: price * 1.02,
  low: price * 0.97,
})

const NOW = '2026-10-27T12:00:00Z'

export const CRYPTO_MOVERS = {
  asset_class: 'crypto',
  as_of: NOW,
  stale: false,
  gainers: [item('SOL', 'Solana', 182, 8.4), item('INJ', 'Injective', 21, 5.4)],
  losers: [item('ETH', 'Ethereum', 3480, -4.4)],
}

const STOCK_MOVERS = {
  asset_class: 'stock',
  as_of: NOW,
  stale: false,
  gainers: [item('NVDA', 'NVIDIA Corporation', 140, 6.9, 'stock')],
  losers: [item('INTC', 'Intel Corporation', 21, -10.3, 'stock')],
}

const OVERVIEW = {
  as_of: NOW,
  stale: false,
  items: [
    item('BTC', 'Bitcoin', 98250, 2.4),
    item('ETH', 'Ethereum', 3480, -4.4),
    item('SOL', 'Solana', 182, 8.4),
  ],
}

/** A smooth, deterministic candle series whose last close is exactly `last`. */
function bars(last: number, count: number, stepSeconds: number) {
  const end = Date.parse(NOW) / 1000
  const shape = (i: number) => 1 + 0.04 * Math.sin(i / 7) - 0.02 * ((count - 1 - i) / count)
  const scale = last / shape(count - 1)
  return Array.from({ length: count }, (_, i) => {
    const close = scale * shape(i)
    return {
      ts: new Date((end - (count - 1 - i) * stepSeconds) * 1000)
        .toISOString()
        .replace('.000Z', 'Z'),
      open: close * 0.997,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1000 + i,
    }
  })
}

const PRICES: Record<string, number> = {
  BTC: 98250,
  ETH: 3480,
  SOL: 182,
  INJ: 21,
  AAPL: 228,
  MSFT: 431,
  NVDA: 140,
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/** Route every /api call of `page` to the fixtures above. */
export async function mockApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/market/movers') {
      return json(
        route,
        url.searchParams.get('asset_class') === 'stock' ? STOCK_MOVERS : CRYPTO_MOVERS,
      )
    }
    if (path === '/api/market/crypto') return json(route, OVERVIEW)
    if (path === '/api/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const all = [
        {
          asset_class: 'stock',
          symbol: 'AAPL',
          name: 'Apple Inc',
          exchange: 'NASDAQ',
          quote: null,
        },
        {
          asset_class: 'stock',
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          exchange: 'NASDAQ',
          quote: null,
        },
        {
          asset_class: 'crypto',
          symbol: 'SOL',
          name: 'Solana',
          exchange: 'Binance',
          quote: 'USDT',
        },
      ]
      const results = all.filter(
        (r) => r.symbol.toLowerCase().startsWith(q) || r.name.toLowerCase().startsWith(q),
      )
      return json(route, { query: q, partial: false, results })
    }
    const match = /^\/api\/(stocks|crypto)\/([A-Z0-9.-]+)$/i.exec(path)
    if (match) {
      const [, kind, symbol] = match
      const price = PRICES[symbol.toUpperCase()]
      if (!price) return json(route, { detail: `Unknown symbol: ${symbol}` }, 404)
      let interval = url.searchParams.get('interval') ?? '5min'
      // INJ imitates a provider outage with no intraday candles saved, so the
      // backend serves the closest saved interval (daily) instead.
      if (symbol.toUpperCase() === 'INJ' && interval.endsWith('min')) interval = 'daily'
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const step =
        {
          '1min': 60,
          '5min': 300,
          '15min': 900,
          '60min': 3600,
          daily: 86400,
          weekly: 7 * 86400,
          monthly: 30 * 86400,
        }[interval] ?? 300
      const quote = url.searchParams.get('quote') ?? 'USDT'
      return json(route, {
        asset_class: kind === 'stocks' ? 'stock' : 'crypto',
        symbol: kind === 'stocks' ? symbol.toUpperCase() : `${symbol.toUpperCase()}${quote}`,
        interval,
        stale: false,
        bars: bars(price, Math.min(limit, 400), step),
      })
    }
    return json(route, { detail: 'Not found' }, 404)
  })
}
