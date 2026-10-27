import type { MarketItem } from '../api/client'
import { useMovers } from '../api/hooks'
import type { Asset } from '../lib/asset'
import { itemAsset } from '../lib/market'
import { useMode } from '../lib/prefs'
import { Change } from './Change'

/** One mover in the ribbon. */
function Chip({
  item,
  onOpen,
  hidden,
}: {
  item: MarketItem
  onOpen: (a: Asset) => void
  hidden?: boolean
}) {
  return (
    <li aria-hidden={hidden || undefined}>
      <button
        type="button"
        tabIndex={hidden ? -1 : undefined}
        onClick={() => onOpen(itemAsset(item))}
        title={item.name ?? item.symbol}
        className="tone flex items-baseline gap-2.5 rounded-full border border-line bg-panel/70 py-2 pr-4 pl-5 text-sm whitespace-nowrap backdrop-blur hover:border-accent"
      >
        <span className="font-semibold font-wide tracking-wide text-ink">{item.symbol}</span>
        <Change percent={item.change_percent} className="text-[0.8rem]" />
      </button>
    </li>
  )
}

/**
 * A slowly gliding band of today's movers. It pauses while hovered or
 * focused, and stands still for viewers who prefer reduced motion.
 */
export function Ribbon({ onOpen }: { onOpen: (a: Asset) => void }) {
  const mode = useMode()
  const crypto = useMovers('crypto')
  const stock = useMovers('stock')
  const pick = (d: typeof crypto.data) => [...(d?.gainers ?? []), ...(d?.losers ?? [])]
  const items =
    mode === 'crypto'
      ? pick(crypto.data)
      : mode === 'stock'
        ? pick(stock.data)
        : [...pick(crypto.data).slice(0, 8), ...pick(stock.data).slice(0, 8)]

  if (items.length === 0) return <div className="h-12" aria-hidden="true" />

  return (
    <section aria-label="Today's movers" className="group relative overflow-hidden py-2">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-ground to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-ground to-transparent sm:w-32" />
      <ul
        className="flex w-max gap-3 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
        style={{ animation: `ribbon ${Math.max(40, items.length * 4)}s linear infinite` }}
      >
        {items.map((item) => (
          <Chip key={`a-${item.asset_class}-${item.symbol}`} item={item} onOpen={onOpen} />
        ))}
        {items.map((item) => (
          <Chip key={`b-${item.asset_class}-${item.symbol}`} item={item} onOpen={onOpen} hidden />
        ))}
      </ul>
    </section>
  )
}
