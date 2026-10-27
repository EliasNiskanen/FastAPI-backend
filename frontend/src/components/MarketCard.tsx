import clsx from 'clsx'
import { useEffect, type ReactNode } from 'react'

import type { MarketItem } from '../api/client'
import type { Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatPrice } from '../lib/format'
import { itemAsset, itemCurrency } from '../lib/market'
import { rememberName } from '../lib/names'
import { Change } from './Change'
import { Note } from './Note'

/** A floating sheet: the shared look of every list on the front page. */
export function Sheet({
  title,
  actions,
  children,
  className,
  id,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, '-')}-title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={clsx(
        'tone float-shadow rounded-[28px] border border-line bg-panel p-5 sm:p-7',
        className,
      )}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="font-wide text-lg font-[650] tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** One clickable row: ticker and name, price and change. Opens the chart dialog. */
export function MarketRow({ item, onOpen }: { item: MarketItem; onOpen: (a: Asset) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(itemAsset(item))}
        className="tone -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-2xl px-3 py-3 text-left hover:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold font-wide tracking-wide text-ink">
            {item.symbol}
          </span>
          <span className="block truncate text-xs text-ink-3">
            {item.name ?? (item.asset_class === 'stock' ? 'US stock' : 'Crypto')}
          </span>
        </span>
        <span className="nums text-right text-sm text-ink">
          {formatPrice(item.price, itemCurrency(item))}
        </span>
        <span className="w-24 text-right text-sm">
          <Change percent={item.change_percent} />
        </span>
      </button>
    </li>
  )
}

/** A list of market items with loading, error, empty and stale states. */
export function MarketList({
  items,
  loading,
  error,
  stale,
  onOpen,
  what,
  rows = 6,
}: {
  items: MarketItem[] | undefined
  loading: boolean
  error: unknown
  stale?: boolean
  onOpen: (a: Asset) => void
  what: string
  rows?: number
}) {
  useEffect(() => {
    items?.forEach((i) => rememberName(itemAsset(i), i.name))
  }, [items])

  if (error) return <Note tone="warn">{errorMessage(error, what)}</Note>
  if (loading) {
    return (
      <ul aria-hidden="true" className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="h-12 animate-pulse rounded-2xl bg-raised" />
        ))}
      </ul>
    )
  }
  if (!items?.length) return <Note>Nothing to show right now.</Note>
  return (
    <>
      <ul className="divide-y divide-line/60">
        {items.slice(0, rows).map((item) => (
          <MarketRow key={`${item.asset_class}-${item.symbol}`} item={item} onOpen={onOpen} />
        ))}
      </ul>
      {stale && (
        <div className="mt-3">
          <Note tone="warn">{STALE_NOTE}</Note>
        </div>
      )}
    </>
  )
}
