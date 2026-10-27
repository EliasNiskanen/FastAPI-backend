import { useDailyBars } from '../api/hooks'
import { assetKey, assetLabel, priceCurrency, type Asset } from '../lib/asset'
import { formatPrice } from '../lib/format'
import { useAssetName } from '../lib/names'
import { useMode } from '../lib/prefs'
import { lastCloses, summarize } from '../lib/series'
import { Change } from './Change'
import { Sheet } from './MarketCard'
import { Note } from './Note'
import { Sparkline } from './Sparkline'

/** One watched asset: latest close, daily change and a 30-day trend line. */
function Row({
  asset,
  onOpen,
  onRemove,
}: {
  asset: Asset
  onOpen: (a: Asset) => void
  onRemove: (a: Asset) => void
}) {
  const bars = useDailyBars(asset)
  const name = useAssetName(asset)
  const summary = bars.data ? summarize(bars.data.bars) : null
  const label = assetLabel(asset)

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="tone -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-4 rounded-2xl py-3 pr-12 pl-3 text-left hover:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold font-wide tracking-wide text-ink">{label}</span>
          <span className="block truncate text-xs text-ink-3">
            {name ?? (asset.kind === 'stock' ? 'US stock' : 'Crypto')}
          </span>
        </span>
        <span className="hidden sm:block" aria-hidden="true">
          <Sparkline values={bars.data ? lastCloses(bars.data.bars, 30) : []} />
        </span>
        {bars.isError ? (
          <span className="text-xs text-ink-3">Data unavailable</span>
        ) : (
          <>
            <span className="nums text-right text-sm text-ink">
              {summary ? formatPrice(summary.last, priceCurrency(asset)) : '–'}
            </span>
            <span className="w-24 text-right text-sm">
              {summary && <Change percent={summary.changePercent} />}
            </span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => onRemove(asset)}
        aria-label={`Remove ${label} from watchlist`}
        className="absolute top-1/2 -right-1 -translate-y-1/2 rounded-full p-2 text-ink-3 opacity-60 transition hover:bg-raised hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
          <path
            d="m4 4 8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </li>
  )
}

/** The viewer's watchlist (saved in this browser), showing the current market mode. */
export function Watchlist({
  items,
  onOpen,
  onRemove,
}: {
  items: Asset[]
  onOpen: (a: Asset) => void
  onRemove: (a: Asset) => void
}) {
  const mode = useMode()
  const shown = mode === 'all' ? items : items.filter((a) => a.kind === mode)
  return (
    <Sheet title="Your watchlist" id="watchlist">
      {shown.length === 0 ? (
        <Note>
          {items.length === 0
            ? 'Your watchlist is empty. Open any stock or coin and choose Add to watchlist.'
            : `No ${mode === 'crypto' ? 'coins' : 'stocks'} in your watchlist yet. Open one and choose Add to watchlist.`}
        </Note>
      ) : (
        <ul className="divide-y divide-line/60">
          {shown.map((asset) => (
            <Row key={assetKey(asset)} asset={asset} onOpen={onOpen} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </Sheet>
  )
}
