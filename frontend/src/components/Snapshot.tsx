import clsx from 'clsx'

import { useDailyBars } from '../api/hooks'
import { assetLabel, priceCurrency, type Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatCompact, formatPrice } from '../lib/format'
import { useAssetName } from '../lib/names'
import { summarize } from '../lib/series'
import { Change } from './Change'
import { Note, Panel } from './Panel'
import { Segmented } from './Segmented'

/**
 * Where the last price sits between the low and high of the loaded period,
 * drawn like a gauge: a hairline track with a red needle.
 */
function RangeGauge({
  low,
  high,
  value,
  currency,
}: {
  low: number
  high: number
  value: number
  currency: string
}) {
  const position = high > low ? ((value - low) / (high - low)) * 100 : 50
  return (
    <div>
      <div className="relative h-5" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        {[0, 25, 50, 75, 100].map((tick) => (
          <div
            key={tick}
            className="absolute top-[calc(50%-3px)] h-1.5 w-px bg-ink-3/60"
            style={{ left: `${tick}%` }}
          />
        ))}
        <div
          className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded-full bg-signal"
          style={{ left: `${Math.min(100, Math.max(0, position))}%` }}
        />
      </div>
      <div className="nums mt-1.5 flex justify-between text-xs text-ink-3">
        <span>{formatPrice(low, currency)}</span>
        <span>{formatPrice(high, currency)}</span>
      </div>
    </div>
  )
}

/** Summary of the selected asset: price, daily change, today's range and the longer range. */
export function Snapshot({
  asset,
  onSelect,
  watched,
  onToggleWatch,
}: {
  asset: Asset
  onSelect: (asset: Asset) => void
  watched: boolean
  onToggleWatch: () => void
}) {
  const bars = useDailyBars(asset)
  const name = useAssetName(asset)
  const summary = bars.data ? summarize(bars.data.bars) : null
  const currency = priceCurrency(asset)

  return (
    <Panel title="Overview" className="lg:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-wide text-2xl leading-tight font-[650] tracking-[-0.01em] text-ink">
            {assetLabel(asset)}
          </p>
          <p className="mt-1 truncate text-sm text-ink-2">
            {name ?? (asset.kind === 'stock' ? 'US stock' : 'Crypto')}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleWatch}
          aria-pressed={watched}
          className={clsx(
            'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
            watched
              ? 'border-signal/60 text-ink'
              : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink',
          )}
        >
          {watched ? 'In watchlist' : 'Add to watchlist'}
        </button>
      </div>

      {bars.isError ? (
        <div className="mt-6">
          <Note tone="warn">{errorMessage(bars.error, 'prices')}</Note>
        </div>
      ) : (
        <div className={clsx('transition-opacity', bars.isPlaceholderData && 'opacity-50')}>
          <p className="mt-6 text-[2.6rem] leading-none font-[620] tracking-[-0.02em] text-ink">
            {summary ? (
              formatPrice(summary.last, currency)
            ) : (
              <span className="inline-block h-10 w-44 animate-pulse rounded bg-raised" />
            )}
          </p>
          <div className="mt-3 min-h-6 text-[0.95rem]">
            {summary && <Change percent={summary.changePercent} absolute={summary.change} />}
          </div>
          <p className="mt-1 text-xs text-ink-3">Change since the previous daily close (UTC)</p>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="text-ink-3">Day high</dt>
              <dd className="nums mt-0.5 text-ink">
                {summary ? formatPrice(summary.dayHigh, currency) : '–'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Day low</dt>
              <dd className="nums mt-0.5 text-ink">
                {summary ? formatPrice(summary.dayLow, currency) : '–'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Day volume</dt>
              <dd className="nums mt-0.5 text-ink">
                {summary ? formatCompact(summary.dayVolume) : '–'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Last candle</dt>
              <dd className="nums mt-0.5 text-ink">
                {summary
                  ? new Date(summary.asOf).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })
                  : '–'}
              </dd>
            </div>
          </dl>

          {summary && (
            <div className="mt-6">
              <p className="mb-2 text-sm text-ink-3">{summary.rangeDays}-day range</p>
              <RangeGauge
                low={summary.rangeLow}
                high={summary.rangeHigh}
                value={summary.last}
                currency={currency}
              />
            </div>
          )}
          {bars.data?.stale && (
            <div className="mt-5">
              <Note tone="warn">{STALE_NOTE}</Note>
            </div>
          )}
        </div>
      )}

      {asset.kind === 'crypto' && (
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="text-sm text-ink-3">Priced in</span>
          <Segmented
            label="Quote currency"
            value={asset.quote}
            onChange={(quote) => onSelect({ ...asset, quote })}
            options={[
              { value: 'USDT', label: 'USDT' },
              { value: 'EUR', label: 'EUR' },
            ]}
          />
        </div>
      )}
    </Panel>
  )
}
