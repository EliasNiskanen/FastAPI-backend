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
import { useEffect, useRef } from 'react'

import type { PriceBar } from '../api/client'
import { precisionFor } from '../lib/chart'
import { useChartColors } from '../lib/useChartColors'

const toTime = (ts: string) => (Date.parse(ts) / 1000) as UTCTimestamp

/**
 * Candlestick chart with volume bars, drawn with TradingView Lightweight
 * Charts in the current mode's colours. Reports the candle under the
 * crosshair through onHover (undefined when the pointer leaves).
 */
export function CandleChart({
  bars,
  intraday,
  label,
  onHover,
}: {
  bars: PriceBar[]
  intraday: boolean
  label: string
  onHover: (bar: PriceBar | undefined) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const colors = useChartColors()

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: "'Archivo Variable', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: { vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderVisible: false, rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: 'en-US',
        priceFormatter: (price: number) => {
          const { precision } = precisionFor(price)
          return price.toLocaleString('en-US', {
            minimumFractionDigits: Math.min(2, precision),
            maximumFractionDigits: precision,
          })
        },
      },
    })
    candlesRef.current = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
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

  // Recolour when the mode or theme changes.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      layout: { textColor: colors.ink3 },
      grid: { horzLines: { color: colors.line } },
      crosshair: {
        vertLine: { color: colors.ink3, labelBackgroundColor: colors.raised },
        horzLine: { color: colors.ink3, labelBackgroundColor: colors.raised },
      },
    })
    candlesRef.current?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineColor: colors.ink3,
    })
  }, [colors])

  // Feed the data.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !candlesRef.current || !volumeRef.current || bars.length === 0) return
    candlesRef.current.applyOptions({
      priceFormat: { type: 'price', ...precisionFor(bars.at(-1)!.close) },
    })
    candlesRef.current.setData(
      bars.map((b) => ({
        time: toTime(b.ts),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )
    volumeRef.current.setData(
      bars.map((b) => ({
        time: toTime(b.ts),
        value: b.volume,
        color: b.close >= b.open ? colors.upFaint : colors.downFaint,
      })),
    )
    chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } })
    chart.timeScale().fitContent()
  }, [bars, intraday, colors])

  // Report the hovered candle.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const byTime = new Map(bars.map((b) => [toTime(b.ts), b]))
    const onMove = (param: { time?: unknown }) =>
      onHover(param.time !== undefined ? byTime.get(param.time as UTCTimestamp) : undefined)
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [bars, onHover])

  return <div ref={containerRef} role="img" aria-label={label} className="h-full w-full" />
}
