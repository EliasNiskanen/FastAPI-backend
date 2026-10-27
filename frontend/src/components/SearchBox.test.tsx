import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchBox } from './SearchBox'

const RESULTS = {
  query: 'app',
  partial: false,
  results: [
    { asset_class: 'stock', symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', quote: null },
    { asset_class: 'crypto', symbol: 'APT', name: 'Aptos', exchange: 'Binance', quote: 'USDT' },
  ],
}

function renderSearch(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SearchBox onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return onSelect
}

describe('SearchBox', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RESULTS))),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows matches and opens the highlighted one with Enter', async () => {
    const onSelect = renderSearch()
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'app')
    expect(await screen.findByRole('option', { name: /AAPL/ })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ kind: 'crypto', symbol: 'APT', quote: 'USDT' })
  })

  it('offers to open a typed ticker that the search did not find', async () => {
    const onSelect = renderSearch()
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'zzzz')
    const option = await screen.findByRole('option', { name: /Open ZZZZ as a US stock ticker/ })
    await user.click(option)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'stock', symbol: 'ZZZZ' })
  })
})
