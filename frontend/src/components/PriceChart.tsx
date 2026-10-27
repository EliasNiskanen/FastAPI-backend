import clsx from 'clsx'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { PriceBar } from '../api/client'
import { useBars, type Interval } from '../api/hooks'
import { assetLabel, priceCurrency, type Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatCompact, formatPrice } from '../lib/format'
import { Note, Panel } from './Panel'
import { Segmented } from './Segmented'

// Chart colours mirror the CSS tokens in index.css (the chart draws on canvas).
const COLORS = {
  ink3: '#93939b',
  line: '#36373d',
  raised: '#2e2f34',
  up: '#4cc98f',
  down: '#ff6b6b',
  upVolume: 'rgba(76, 201, 143, 0.28)',
  downVolume: 'rgba(255, 107, 107, 0.28)',
}

const INTERVALS: { value: Interval; label: string; limit: number }[] = [
  { value: '5min', label: '5m', limit: 288 },
  { value: '15min', label: '15m', limit: 384 },
  { value: '60min', label: '1h', limit: 500 },
  { value: 'daily', label: '1D', limit: 365 },
]

/** Price precision for the axis: more decimals for cheap coins. */
function precisionFor(price: number): { precision: number; minMove: number } {
  const precision =
    price >= 100 ? 2 : price >= 1 ? 3 : Math.min(8, Math.max(4, -Math.floor(Math.log10(price)) + 3))
  return { precision, minMove: 1 / 10 ** precision }
}

const toTime = (ts: string) => (Date.parse(ts) / 1000) as UTCTimestamp

/** The candle under the crosshair (or the latest one) as a row of numbers. */
function Readout({ bar, currency }: { bar: PriceBar | undefined; currency: string }) {
  const items: [string, string][] = bar
    ? [
        ['Open', formatPrice(bar.open, currency)],
        ['High', formatPrice(bar.high, currency)],
        ['Low', formatPrice(bar.low, currency)],
        ['Close', formatPrice(bar.close, currency)],
        ['Volume', formatCompact(bar.volume)],
      ]
    : []
  return (
    <dl className="nums mt-4 flex min-h-5 flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-xs">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-ink-3">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Candlestick chart with volume for the selected asset, with an interval switch. */
export function PriceChart({ asset }: { asset: Asset }) {
  // Remember the interval per market. Stocks default to daily candles because
  // every intraday interval costs an Alpha Vantage request.
  const [intervals, setIntervals] = useState<Record<Asset['kind'], Interval>>({
    stock: 'daily',
    crypto: '60min',
  })
  const interval = intervals[asset.kind]
  const setInterval = (value: Interval) => setIntervals((all) => ({ ...all, [asset.kind]: value }))
  const limit = INTERVALS.find((i) => i.value === interval)!.limit
  const query = useBars(asset, interval, limit)
  const bars = useMemo(() => query.data?.bars ?? [], [query.data])
  const currency = priceCurrency(asset)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [hovered, setHovered] = useState<PriceBar | undefined>()

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: COLORS.ink3,
        fontFamily: "'Archivo Variable', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS.line } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderVisible: false, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: COLORS.ink3, width: 1, style: 0, labelBackgroundColor: COLORS.raised },
        horzLine: { color: COLORS.ink3, width: 1, style: 0, labelBackgroundColor: COLORS.raised },
      },
      localization: {
        locale: 'en-US',
        // Thousands separators and sensible decimals: 98,250.00 or 0.000018.
        priceFormatter: (price: number) => {
          const { precision } = precisionFor(Math.abs(price) || 1)
          return price.toLocaleString('en-US', {
            minimumFractionDigits: Math.min(2, precision),
            maximumFractionDigits: precision,
          })
        },
      },
    })
    candlesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: false,
      priceLineColor: COLORS.ink3,
      priceLineStyle: 2,
    })
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // Feed data whenever it changes.
  useEffect(() => {
    const chart = chartRef.current
    const candles = candlesRef.current
    const volume = volumeRef.current
    if (!chart || !candles || !volume || bars.length === 0) return
    const last = bars.at(-1)!.close
    candles.applyOptions({ priceFormat: { type: 'price', ...precisionFor(last) } })
    candles.setData(
      bars.map((b) => ({
        time: toTime(b.ts),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    volume.setData(
      bars.map((b) => ({
        time: toTime(b.ts),
        value: b.volume,
        color: b.close >= b.open ? COLORS.upVolume : COLORS.downVolume,
      })),
    )
    chart.applyOptions({ timeScale: { timeVisible: interval !== 'daily', secondsVisible: false } })
    chart.timeScale().fitContent()
  }, [bars, interval])

  // Show the hovered candle's numbers below the chart.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const byTime = new Map(bars.map((b) => [toTime(b.ts), b]))
    const onMove = (param: { time?: unknown }) => {
      setHovered(param.time !== undefined ? byTime.get(param.time as UTCTimestamp) : undefined)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [bars])

  return (
    <Panel
      title={`${assetLabel(asset)} price`}
      className="lg:col-span-6"
      actions={
        <Segmented
          label="Candle interval"
          value={interval}
          onChange={setInterval}
          options={INTERVALS.map(({ value, label }) => ({ value, label }))}
        />
      }
    >
      <div className="relative">
        <div
          ref={containerRef}
          role="img"
          aria-label={`Candlestick chart of ${assetLabel(asset)}, ${INTERVALS.find((i) => i.value === interval)!.label} candles`}
          className={clsx(
            'h-[360px] w-full transition-opacity lg:h-[420px]',
            query.isPlaceholderData && 'opacity-50',
          )}
        />
        {(query.isError || (query.isPending && !query.isPlaceholderData)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel">
            {query.isError ? (
              <div className="max-w-sm text-center">
                <Note tone="warn">{errorMessage(query.error, 'chart data')}</Note>
              </div>
            ) : (
              <span className="text-sm text-ink-3">Loading chart…</span>
            )}
          </div>
        )}
      </div>
      <Readout bar={hovered ?? bars.at(-1)} currency={currency} />
      {query.data?.stale && (
        <div className="mt-3">
          <Note tone="warn">{STALE_NOTE}</Note>
        </div>
      )}
    </Panel>
  )
}
