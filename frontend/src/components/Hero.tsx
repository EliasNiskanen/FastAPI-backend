import { useEffect, type Ref } from 'react'

import type { MarketItem } from '../api/client'
import { useMovers } from '../api/hooks'
import type { Asset } from '../lib/asset'
import { STOCKS_ENABLED } from '../lib/features'
import { itemAsset } from '../lib/market'
import { rememberName } from '../lib/names'
import { kindsFor, useMode, type Mode } from '../lib/prefs'
import { Orbs } from './Orbs'
import { SearchBox } from './SearchBox'
import { StocksPausedBanner, StocksPausedNotice } from './StocksPaused'

const CAPTIONS: Record<Mode, string> = STOCKS_ENABLED
  ? {
      all: 'The biggest move today across actively traded coins and US stocks.',
      crypto: 'The biggest 24-hour move among actively traded coins.',
      stock: "The biggest move in today's US stock market.",
    }
  : {
      all: 'The biggest 24-hour move among actively traded coins.',
      crypto: 'The biggest 24-hour move among actively traded coins.',
      stock: '',
    }

/** The largest move (up or down) among the given movers lists. */
function biggestMove(lists: (MarketItem[] | undefined)[]): MarketItem | undefined {
  return lists
    .flat()
    .filter((m): m is MarketItem => m !== undefined)
    .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))[0]
}

/** The headline: today's story, written from live data. */
function headline(top: MarketItem | undefined): string {
  if (!top) return 'Watch the bulls and the bears.'
  const name = top.name ?? top.symbol
  const verb = top.change_percent >= 0 ? 'up' : 'down'
  return `${name} is ${verb} ${Math.abs(top.change_percent).toFixed(1)}% today.`
}

const TITLE =
  'font-wide text-[clamp(2.3rem,6.6vw,5.4rem)] leading-[1.02] font-[680] tracking-[-0.03em] text-balance text-ink'

/**
 * Front page opening: a live headline over slowly drifting colour fields,
 * and the search. Nothing here is a chart yet; charts open on demand.
 * While stock prices are paused, the Stocks tab explains why instead.
 */
export function Hero({
  onOpen,
  searchRef,
}: {
  onOpen: (a: Asset) => void
  searchRef?: Ref<HTMLDivElement>
}) {
  const mode = useMode()
  const crypto = useMovers('crypto')
  const stock = useMovers('stock')
  const stocksPaused = !STOCKS_ENABLED && mode === 'stock'

  const cryptoLists = [crypto.data?.gainers, crypto.data?.losers]
  const stockLists = STOCKS_ENABLED ? [stock.data?.gainers, stock.data?.losers] : []
  const lists =
    mode === 'crypto'
      ? cryptoLists
      : mode === 'stock'
        ? stockLists
        : [...cryptoLists, ...stockLists]
  const top = stocksPaused ? undefined : biggestMove(lists)
  const loading = mode === 'stock' && STOCKS_ENABLED ? stock.isPending : crypto.isPending

  useEffect(() => {
    if (top) rememberName(itemAsset(top), top.name)
  }, [top])

  if (stocksPaused) {
    return (
      <section
        aria-labelledby="hero-title"
        className="relative isolate px-4 pt-20 pb-16 sm:px-8 sm:pt-28 lg:pb-24"
      >
        <Orbs />
        <div className="mx-auto max-w-[62rem] text-center">
          <h1 id="hero-title" className={TITLE}>
            Stock prices are taking a break.
          </h1>
          <div className="mt-8">
            <StocksPausedNotice />
          </div>
        </div>
        {/* Keeps the header's compact search logic working on this tab too. */}
        <div ref={searchRef} aria-hidden="true" />
      </section>
    )
  }

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate px-4 pt-14 pb-16 sm:px-8 sm:pt-20 lg:pb-24"
    >
      <Orbs />
      {/* The pause notice belongs on the mixed front page, not the Crypto tab. */}
      {!STOCKS_ENABLED && mode === 'all' && (
        <div className="mb-10 sm:mb-12">
          <StocksPausedBanner />
        </div>
      )}
      <div className="mx-auto max-w-[62rem] text-center">
        <h1
          id="hero-title"
          aria-live="polite"
          className={`${TITLE} transition-opacity duration-700`}
          style={{ opacity: loading ? 0 : 1 }}
        >
          {headline(top)}
        </h1>
        <p className="mx-auto mt-6 max-w-[44ch] text-lg leading-relaxed text-ink-2">
          {CAPTIONS[mode]}
        </p>
        {top && (
          <button
            type="button"
            onClick={() => onOpen(itemAsset(top))}
            className="tone mt-6 rounded-full border border-line px-5 py-2 text-sm font-medium text-ink hover:border-accent"
          >
            Open the {top.symbol} chart
          </button>
        )}
      </div>

      <div ref={searchRef} className="mx-auto mt-12 max-w-[40rem]">
        <SearchBox
          onSelect={onOpen}
          shortcut
          kinds={kindsFor(mode)}
          placeholder={
            !STOCKS_ENABLED || mode === 'crypto'
              ? 'Search a coin'
              : mode === 'stock'
                ? 'Search a company or ticker'
                : undefined
          }
        />
      </div>
    </section>
  )
}
