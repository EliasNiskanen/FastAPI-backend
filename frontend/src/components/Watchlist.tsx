import clsx from 'clsx'

import { useDailyBars } from '../api/hooks'
import { assetKey, assetLabel, priceCurrency, sameAsset, type Asset } from '../lib/asset'
import { formatPrice } from '../lib/format'
import { useAssetName } from '../lib/names'
import { lastCloses, summarize } from '../lib/series'
import { Change } from './Change'
import { Panel } from './Panel'
import { Sparkline } from './Sparkline'

/** One watched asset: latest close, daily change and a 30-day sparkline. */
function Row({
  asset,
  active,
  onSelect,
  onRemove,
}: {
  asset: Asset
  active: boolean
  onSelect: (a: Asset) => void
  onRemove: (a: Asset) => void
}) {
  const bars = useDailyBars(asset)
  const name = useAssetName(asset)
  const summary = bars.data ? summarize(bars.data.bars) : null
  const label = assetLabel(asset)

  return (
    <tr
      className={clsx('group cursor-pointer border-t border-line/60', active && 'bg-raised/60')}
      onClick={() => onSelect(asset)}
    >
      <th scope="row" className="relative py-3 pr-3 text-left font-normal">
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 -left-6 h-6 w-0.5 -translate-y-1/2 bg-signal sm:-left-6"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(asset)
          }}
          aria-current={active ? 'true' : undefined}
          className="block text-left"
        >
          <span className="block font-semibold font-wide tracking-wide text-ink">{label}</span>
          <span className="block max-w-[14rem] truncate text-xs text-ink-3">
            {name ?? (asset.kind === 'stock' ? 'US stock' : 'Crypto')}
          </span>
        </button>
      </th>
      {bars.isError ? (
        <td colSpan={3} className="py-3 text-right text-xs text-ink-3">
          Data unavailable
        </td>
      ) : (
        <>
          <td className="nums py-3 text-right text-ink">
            {summary ? formatPrice(summary.last, priceCurrency(asset)) : <Placeholder />}
          </td>
          <td className="py-3 pl-3 text-right">
            {summary ? <Change percent={summary.changePercent} /> : <Placeholder />}
          </td>
          <td className="hidden py-3 pl-6 sm:table-cell">
            <div className="flex justify-end">
              <Sparkline values={bars.data ? lastCloses(bars.data.bars, 30) : []} />
            </div>
          </td>
        </>
      )}
      <td className="py-3 pl-3 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(asset)
          }}
          aria-label={`Remove ${label} from watchlist`}
          className="rounded-md p-1.5 text-ink-3 opacity-60 transition hover:bg-raised hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
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
      </td>
    </tr>
  )
}

function Placeholder() {
  return (
    <span aria-hidden="true" className="inline-block h-4 w-16 animate-pulse rounded bg-raised" />
  )
}

/** Assets the viewer follows, saved in this browser. */
export function Watchlist({
  items,
  selected,
  onSelect,
  onRemove,
}: {
  items: Asset[]
  selected: Asset
  onSelect: (a: Asset) => void
  onRemove: (a: Asset) => void
}) {
  return (
    <Panel title="Watchlist" id="watchlist" className="lg:col-span-7">
      {items.length === 0 ? (
        <p className="max-w-[40ch] text-sm leading-relaxed text-ink-3">
          Your watchlist is empty. Search for a stock or coin and choose Add to watchlist to follow
          it here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">
            Watchlist with last price, daily change and 30-day trend
          </caption>
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th scope="col" className="pb-2 font-normal">
                Asset
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Last
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Day
              </th>
              <th scope="col" className="hidden pb-2 text-right font-normal sm:table-cell">
                30 days
              </th>
              <th scope="col" className="pb-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((asset) => (
              <Row
                key={assetKey(asset)}
                asset={asset}
                active={sameAsset(asset, selected)}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
