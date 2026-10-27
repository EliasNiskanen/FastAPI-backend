import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PriceBar } from '../api/client'
import { useBars } from '../api/hooks'
import { assetKey, assetLabel, priceCurrency, type Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatCompact, formatPrice } from '../lib/format'
import { useAssetName } from '../lib/names'
import {
  DEFAULT_RANGE,
  intervalName,
  isIntraday,
  isIntradayInterval,
  RANGES,
  sourceFor,
  type RangeId,
} from '../lib/ranges'
import { percentFromStart, summarizeRange } from '../lib/series'
import { useChartColors } from '../lib/useChartColors'
import { CandleChart } from './CandleChart'
import { Change } from './Change'
import { Note } from './Note'
import { PercentChart } from './PercentChart'
import { SearchBox } from './SearchBox'
import { Segmented } from './Segmented'

/** Candles for an asset over a range (null asset = nothing to load). */
function useRangeBars(asset: Asset | null, range: RangeId) {
  const source = asset ? sourceFor(asset, range) : { interval: 'daily' as const, limit: 1 }
  return useBars(asset, source.interval, source.limit)
}

/** Numbers for the range, or for the candle under the pointer. */
function Stats({
  bars,
  hovered,
  currency,
}: {
  bars: PriceBar[]
  hovered?: PriceBar
  currency: string
}) {
  const s = summarizeRange(bars)
  const items: [string, string][] = hovered
    ? [
        ['Open', formatPrice(hovered.open, currency)],
        ['High', formatPrice(hovered.high, currency)],
        ['Low', formatPrice(hovered.low, currency)],
        ['Close', formatPrice(hovered.close, currency)],
        ['Volume', formatCompact(hovered.volume)],
      ]
    : s
      ? [
          ['Open', formatPrice(s.open, currency)],
          ['High', formatPrice(s.high, currency)],
          ['Low', formatPrice(s.low, currency)],
          ['Close', formatPrice(s.close, currency)],
          ['Volume', formatCompact(s.volume)],
        ]
      : []
  return (
    <dl className="nums grid grid-cols-3 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-ink-3">{k}</dt>
          <dd className="mt-0.5 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The chart for one stock or coin, floating above the page. Pick a time
 * range, switch the quote currency for crypto, add it to the watchlist, or
 * compare it with a second asset on a shared percent-change chart.
 * Closes with Esc, the close button, or a click outside.
 */
export function AssetDialog({
  asset,
  onClose,
  onSwitch,
  watched,
  onToggleWatch,
}: {
  asset: Asset | null
  onClose: () => void
  onSwitch: (asset: Asset) => void
  watched: boolean
  onToggleWatch: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE)
  const [compare, setCompare] = useState<Asset | null>(null)
  const [hovered, setHovered] = useState<PriceBar | undefined>()
  // Keep showing the last asset while the dialog fades out after closing.
  const [shown, setShown] = useState<Asset | null>(asset)
  if (asset && asset !== shown) setShown(asset)
  // A different asset starts without a comparison or hover readout.
  const key = shown ? assetKey(shown) : ''
  const [shownKey, setShownKey] = useState(key)
  if (key !== shownKey) {
    setShownKey(key)
    setCompare(null)
    setHovered(undefined)
  }
  const colors = useChartColors()

  // Open or close the native dialog to match the URL.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (asset && !dialog.open) {
      dialog.showModal()
      // Start on the close button, not the first control in the header.
      closeRef.current?.focus()
    }
    if (!asset && dialog.open) dialog.close()
  }, [asset])

  const main = useRangeBars(shown, range)
  const other = useRangeBars(compare, range)
  const name = useAssetName(shown ?? { kind: 'stock', symbol: '' })
  const otherName = useAssetName(compare ?? { kind: 'stock', symbol: '' })
  const onHover = useCallback((bar: PriceBar | undefined) => setHovered(bar), [])

  const bars = main.data?.bars ?? []
  const summary = summarizeRange(bars)
  const currency = shown ? priceCurrency(shown) : 'USD'
  const rangeInfo = RANGES.find((r) => r.id === range)!
  // The backend serves the closest saved candle size when the requested one
  // can't be fetched (e.g. daily candles when the stock quota is used up).
  const requested = shown ? sourceFor(shown, range).interval : 'daily'
  const served = main.data?.interval ?? requested
  const substituted = served !== requested && bars.length > 0
  const phrase = substituted
    ? `since ${new Date(bars[0].ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : rangeInfo.phrase
  const intraday = substituted ? isIntradayInterval(served) : isIntraday(range)

  return (
    <dialog
      ref={ref}
      aria-labelledby="asset-dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="sheet tone float-shadow m-auto max-h-[calc(100dvh-1.5rem)] w-[min(1100px,calc(100vw-1.5rem))] overflow-y-auto rounded-[28px] border border-line bg-panel p-0 text-ink"
    >
      {shown && (
        <div className="p-5 sm:p-8">
          {/* Header: what this is, its price and how it moved in the range */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-ink-3">
                {shown.kind === 'stock' ? 'US stock' : `Crypto, priced in ${shown.quote}`}
              </p>
              <h2
                id="asset-dialog-title"
                className="mt-1 font-wide text-[clamp(1.6rem,4vw,2.4rem)] leading-tight font-[680] tracking-[-0.02em]"
              >
                {assetLabel(shown)}
                {name && (
                  <span className="ml-3 align-middle text-base font-normal tracking-normal text-ink-2 [font-stretch:100%]">
                    {name}
                  </span>
                )}
              </h2>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-3xl font-[620] tracking-[-0.02em]">
                  {summary ? (
                    formatPrice(summary.close, currency)
                  ) : (
                    <span className="inline-block h-8 w-36 animate-pulse rounded bg-raised" />
                  )}
                </span>
                {summary && (
                  <span className="text-sm">
                    <Change percent={summary.changePercent} absolute={summary.change} />{' '}
                    <span className="text-ink-3">{phrase}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onToggleWatch}
                aria-pressed={watched}
                className={clsx(
                  'tone hidden rounded-full border px-4 py-2 text-sm font-medium sm:block',
                  watched
                    ? 'border-accent text-ink'
                    : 'border-line text-ink-2 hover:border-accent hover:text-ink',
                )}
              >
                {watched ? 'In watchlist' : 'Add to watchlist'}
              </button>
              <button
                type="button"
                ref={closeRef}
                onClick={onClose}
                aria-label="Close chart"
                className="tone grid size-10 place-items-center rounded-full bg-raised text-ink-2 hover:text-ink"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
                  <path
                    d="m4 4 8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Segmented
              label="Time range"
              value={range}
              onChange={(r) => {
                setRange(r)
                setHovered(undefined)
              }}
              options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
            />
            {shown.kind === 'crypto' && (
              <Segmented
                label="Quote currency"
                value={shown.quote}
                onChange={(quote) => onSwitch({ ...shown, quote })}
                options={[
                  { value: 'USDT', label: 'USDT' },
                  { value: 'EUR', label: 'EUR' },
                ]}
              />
            )}
            <div className="ml-auto w-full sm:w-72">
              {compare ? (
                <div className="tone flex h-10 items-center justify-between gap-2 rounded-full border border-line pr-1.5 pl-4 text-sm">
                  <span className="truncate">
                    <span className="text-ink-3">Compared with </span>
                    <span className="font-semibold">{assetLabel(compare)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCompare(null)}
                    aria-label="Stop comparing"
                    className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-raised hover:text-ink"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3">
                      <path
                        d="m4 4 8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <SearchBox
                  size="compact"
                  label="Compare with another stock or coin"
                  placeholder="Compare with…"
                  onSelect={(a) => {
                    if (assetKey(a) !== key) setCompare(a)
                  }}
                />
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="relative mt-5 h-[min(52vh,440px)] min-h-[260px]">
            {compare ? (
              <PercentChart
                intraday={intraday}
                series={[
                  {
                    key: 'a',
                    label: name ? `${assetLabel(shown)} (${name})` : assetLabel(shown),
                    color: colors.seriesA,
                    points: percentFromStart(bars),
                  },
                  {
                    key: 'b',
                    label: otherName
                      ? `${assetLabel(compare)} (${otherName})`
                      : assetLabel(compare),
                    color: colors.seriesB,
                    points: percentFromStart(other.data?.bars ?? []),
                  },
                ]}
              />
            ) : (
              <div
                className={clsx(
                  'h-full transition-opacity duration-300',
                  main.isPlaceholderData && 'opacity-40',
                )}
              >
                <CandleChart
                  bars={bars}
                  intraday={intraday}
                  label={`Candlestick chart of ${assetLabel(shown)} ${phrase}`}
                  onHover={onHover}
                />
              </div>
            )}
            {(main.isError || other.isError || (main.isPending && !main.isPlaceholderData)) && (
              <div className="absolute inset-0 grid place-items-center bg-panel/90">
                <div className="max-w-sm text-center">
                  {main.isError || other.isError ? (
                    <Note tone="warn">{errorMessage(main.error ?? other.error, 'prices')}</Note>
                  ) : (
                    <span className="text-sm text-ink-3">Loading chart…</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Numbers */}
          <div className="mt-6 border-t border-line pt-5">
            {compare ? (
              <p className="text-sm text-ink-2">
                Both lines start at 0% at the beginning of the range, so you can compare how much
                each one moved.
              </p>
            ) : (
              <Stats bars={bars} hovered={hovered} currency={currency} />
            )}
            {substituted ? (
              <div className="mt-3">
                <Note tone="warn">
                  {`${rangeInfo.label} data for ${assetLabel(shown)} can't be fetched right now (the free stock data quota resets daily), so these are the closest saved prices: ${intervalName(served)} candles.`}
                </Note>
              </div>
            ) : (
              (main.data?.stale || other.data?.stale) && (
                <div className="mt-3">
                  <Note tone="warn">{STALE_NOTE}</Note>
                </div>
              )
            )}
            <button
              type="button"
              onClick={onToggleWatch}
              aria-pressed={watched}
              className="tone mt-5 w-full rounded-full border border-line py-2.5 text-sm font-medium text-ink sm:hidden"
            >
              {watched ? 'In watchlist' : 'Add to watchlist'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
