import clsx from 'clsx'
import { useEffect, useState, type Ref } from 'react'

import type { MarketItem, MoversOut } from '../api/client'
import { useMovers } from '../api/hooks'
import { DEFAULT_QUOTE, type Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatPercent } from '../lib/format'
import { rememberName } from '../lib/names'
import { Change } from './Change'
import { HeroChart } from './HeroChart'
import { Note } from './Panel'
import { SearchBox } from './SearchBox'
import { Segmented } from './Segmented'

/** A mover as an asset the dashboard can open. */
function toAsset(item: MarketItem): Asset {
  return item.asset_class === 'stock'
    ? { kind: 'stock', symbol: item.symbol }
    : { kind: 'crypto', symbol: item.symbol, quote: item.quote ?? DEFAULT_QUOTE }
}

/**
 * The headline is today's story, written from live data: the biggest move
 * among actively traded coins. Crypto trades around the clock, so there is
 * always a fresh answer.
 */
function headline(data: MoversOut | undefined): {
  title: string
  caption: string
  top?: MarketItem
} {
  const up = data?.gainers[0]
  const down = data?.losers[0]
  const top =
    up && down ? (Math.abs(down.change_percent) > up.change_percent ? down : up) : (up ?? down)
  if (!top) {
    return {
      title: 'Every stock and coin, one search away.',
      caption: 'Search US stocks and crypto, and follow what moves today.',
    }
  }
  const name = top.name ?? top.symbol
  const verb = top.change_percent >= 0 ? 'up' : 'down'
  return {
    title: `${name} is ${verb} ${formatPercent(Math.abs(top.change_percent), 1).replace('+', '')} today.`,
    caption: 'The biggest 24-hour move among actively traded coins.',
    top,
  }
}

/** A clickable mover: ticker and change. */
function MoverChip({ item, onSelect }: { item: MarketItem; onSelect: (a: Asset) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(toAsset(item))}
        title={item.name ?? item.symbol}
        className="flex items-baseline gap-2.5 rounded-full border border-line bg-panel py-1.5 pr-3.5 pl-4 text-sm transition-colors hover:border-ink-3 hover:bg-raised"
      >
        <span className="font-semibold font-wide tracking-wide text-ink">{item.symbol}</span>
        <Change percent={item.change_percent} className="text-[0.8rem]" />
      </button>
    </li>
  )
}

/** One row of movers ("Rising" or "Falling"), or a placeholder while loading. */
function MoverRow({
  label,
  items,
  loading,
  onSelect,
}: {
  label: string
  items: MarketItem[] | undefined
  loading: boolean
  onSelect: (a: Asset) => void
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <h3 className="pt-1.5 text-sm text-ink-2">{label}</h3>
      {loading ? (
        <div aria-hidden="true" className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="h-8 w-28 animate-pulse rounded-full bg-panel" />
          ))}
        </div>
      ) : items?.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <MoverChip key={item.symbol} item={item} onSelect={onSelect} />
          ))}
        </ul>
      ) : (
        <p className="pt-1.5 text-sm text-ink-3">Nothing to show yet.</p>
      )}
    </div>
  )
}

/** Front page: live headline, the search, and today's rising and falling assets. */
export function Hero({
  onSelect,
  searchRef,
}: {
  onSelect: (asset: Asset) => void
  searchRef?: Ref<HTMLDivElement>
}) {
  const [kind, setKind] = useState<Asset['kind']>('crypto')
  const crypto = useMovers('crypto')
  const movers = useMovers(kind)
  const { title, caption, top } = headline(crypto.data)

  useEffect(() => {
    for (const item of [...(movers.data?.gainers ?? []), ...(movers.data?.losers ?? [])]) {
      rememberName(toAsset(item), item.name)
    }
  }, [movers.data])

  const updated = movers.data
    ? new Date(movers.data.as_of).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto max-w-[1440px] px-4 pt-14 pb-16 sm:px-8 lg:pt-24 lg:pb-24"
    >
      <div className="grid items-end gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div>
          <div className="max-w-[60rem]">
            <h1
              id="hero-title"
              aria-live="polite"
              className={clsx(
                'font-wide text-[clamp(2.4rem,6.4vw,5.6rem)] leading-[0.98] font-[680] tracking-[-0.025em] text-balance text-ink',
                crypto.isPending && 'opacity-0',
              )}
            >
              {title}
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-2">{caption}</p>
          </div>
        </div>
        <div className="hidden lg:block">{top && <HeroChart item={top} />}</div>
      </div>

      <div ref={searchRef} className="mt-10 max-w-[44rem]">
        <SearchBox onSelect={onSelect} shortcut />
      </div>

      <div className="mt-14 border-t border-line pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[0.95rem] font-semibold text-ink">Today’s movers</h2>
          <div className="flex items-center gap-4">
            {updated && <span className="text-xs text-ink-3">Updated {updated}</span>}
            <Segmented
              label="Market"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'crypto', label: 'Crypto' },
                { value: 'stock', label: 'US stocks' },
              ]}
            />
          </div>
        </div>
        {movers.isError ? (
          <Note tone="warn">{errorMessage(movers.error, 'movers')}</Note>
        ) : (
          <div className="space-y-4">
            <MoverRow
              label="Rising"
              items={movers.data?.gainers}
              loading={movers.isPending}
              onSelect={onSelect}
            />
            <MoverRow
              label="Falling"
              items={movers.data?.losers}
              loading={movers.isPending}
              onSelect={onSelect}
            />
            {movers.data?.stale && <Note tone="warn">{STALE_NOTE}</Note>}
          </div>
        )}
      </div>
    </section>
  )
}
