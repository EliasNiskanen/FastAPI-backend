import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { useManyDailyBars } from '../api/hooks'
import { assetKey, assetLabel, type Asset } from '../lib/asset'
import { colorSlots } from '../lib/colors'
import { formatPercent } from '../lib/format'
import { percentSince, type PercentPoint } from '../lib/series'
import { Panel } from './Panel'
import { Segmented } from './Segmented'

type Range = '30' | '90'
const HEIGHT = 300
const MARGIN = { top: 12, right: 72, bottom: 26, left: 44 }
const DAY = 86_400

interface Line {
  key: string
  label: string
  color: string
  points: PercentPoint[]
}

/** Round axis ticks (e.g. −10%, −5%, 0%, 5%) that always include 0. */
function percentTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1)
  const raw = span / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const first = Math.floor(min / step)
  const last = Math.ceil(max / step)
  const ticks = []
  for (let i = first; i <= last; i++) ticks.push(+(i * step).toFixed(6))
  return ticks
}

/** Width of an element, kept up to date as the layout changes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * How the watchlist has performed: every asset as percent change since the
 * start of the period, on one shared axis. Very different prices (a $0.20 coin,
 * a $500 stock) become directly comparable.
 */
export function CompareChart({ assets }: { assets: Asset[] }) {
  const [range, setRange] = useState<Range>('30')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const shown = assets.slice(0, 5)
  const queries = useManyDailyBars(shown)
  const [boxRef, width] = useWidth()
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  const keys = shown.map(assetKey)
  const colors = colorSlots(keys)
  // The period ends at the newest candle we have (not "now"), so it is stable between renders.
  const newest = Math.max(
    0,
    ...queries.map((q) => {
      const ts = q.data?.bars.at(-1)?.ts
      return ts ? Date.parse(ts) / 1000 : 0
    }),
  )
  const since = newest - Number(range) * DAY

  const lines: Line[] = shown.flatMap((asset, i) => {
    const bars = queries[i]?.data?.bars
    const points = bars ? percentSince(bars, since) : []
    return points.length > 1
      ? [{ key: keys[i], label: assetLabel(asset), color: colors.get(keys[i])!, points }]
      : []
  })
  const loading = queries.some((q) => q.isPending)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const values = lines.flatMap((l) => l.points.map((p) => p.value))
  const ticks = percentTicks(Math.min(0, ...values), Math.max(0, ...values))
  const yMin = ticks[0]
  const yMax = ticks.at(-1)!
  const tMin = since
  const tMax = Math.max(since + DAY, ...lines.map((l) => l.points.at(-1)!.time))
  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin)) * plotW
  const y = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH

  // End labels, nudged apart so they never overlap.
  const endLabels = lines
    .map((l) => ({ ...l, last: l.points.at(-1)!, y: 0 }))
    .sort((a, b) => b.last.value - a.last.value)
  let previousY = -Infinity
  for (const label of endLabels) {
    label.y = Math.max(y(label.last.value), previousY + 16)
    previousY = label.y
  }

  const dateTicks = Array.from({ length: 4 }, (_, i) => tMin + ((tMax - tMin) * i) / 3)
  const fmtDate = (t: number) =>
    new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })

  /** The point of a line closest to a time. */
  const nearest = (points: PercentPoint[], t: number) =>
    points.reduce((best, p) => (Math.abs(p.time - t) < Math.abs(best.time - t) ? p : best))

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    if (px < MARGIN.left || px > MARGIN.left + plotW) return setHoverTime(null)
    setHoverTime(tMin + ((px - MARGIN.left) / plotW) * (tMax - tMin))
  }

  const hover =
    hoverTime === null || lines.length === 0
      ? null
      : (() => {
          const at = nearest(lines[0].points, hoverTime).time
          return {
            time: at,
            rows: lines
              .map((l) => ({ ...l, point: nearest(l.points, at) }))
              .sort((a, b) => b.point.value - a.point.value),
          }
        })()

  return (
    <Panel
      title="Performance"
      className="lg:col-span-5"
      actions={
        <div className="flex gap-2">
          <Segmented
            label="Period"
            value={range}
            onChange={setRange}
            options={[
              { value: '30', label: '1M' },
              { value: '90', label: '3M' },
            ]}
          />
          <Segmented
            label="Show as"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>
      }
    >
      {shown.length < 2 ? (
        <p className="text-sm text-ink-3">
          Add at least two assets to your watchlist to compare them here.
        </p>
      ) : (
        <>
          <ul
            className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2"
            aria-label="Legend"
          >
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: l.color }}
                />
                {l.label}
              </li>
            ))}
          </ul>

          {view === 'table' ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Percent change over the selected period</caption>
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th scope="col" className="pb-2 font-normal">
                    Asset
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    From
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...lines]
                  .sort((a, b) => b.points.at(-1)!.value - a.points.at(-1)!.value)
                  .map((l) => (
                    <tr key={l.key} className="border-t border-line/60">
                      <th scope="row" className="py-2.5 text-left font-normal text-ink">
                        {l.label}
                      </th>
                      <td className="nums py-2.5 text-right text-ink-2">
                        {fmtDate(l.points[0].time)}
                      </td>
                      <td className="nums py-2.5 text-right text-ink">
                        {formatPercent(l.points.at(-1)!.value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div ref={boxRef} className="relative">
              <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={`Percent change over ${range} days: ${endLabels
                  .map((l) => `${l.label} ${formatPercent(l.last.value)}`)
                  .join(', ')}`}
                onPointerMove={onPointer}
                onPointerLeave={() => setHoverTime(null)}
                className="block touch-pan-y"
              >
                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={MARGIN.left}
                      x2={MARGIN.left + plotW}
                      y1={y(t)}
                      y2={y(t)}
                      stroke={t === 0 ? 'var(--color-ink-3)' : 'var(--color-line)'}
                      strokeWidth="1"
                    />
                    <text
                      x={MARGIN.left - 8}
                      y={y(t)}
                      dy="0.32em"
                      textAnchor="end"
                      className="nums fill-ink-3 text-[11px]"
                    >
                      {t === 0 ? '0%' : formatPercent(t, Math.abs(t) < 1 ? 1 : 0)}
                    </text>
                  </g>
                ))}
                {dateTicks.map((t, i) => (
                  <text
                    key={t}
                    x={x(t)}
                    y={HEIGHT - 6}
                    textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                    className="fill-ink-3 text-[11px]"
                  >
                    {fmtDate(t)}
                  </text>
                ))}

                {lines.map((l) => (
                  <polyline
                    key={l.key}
                    fill="none"
                    stroke={l.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={l.points
                      .map((p) => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`)
                      .join(' ')}
                  />
                ))}

                {endLabels.map((l) => (
                  <g key={l.key}>
                    <circle
                      cx={x(l.last.time)}
                      cy={y(l.last.value)}
                      r="3.5"
                      fill={l.color}
                      stroke="var(--color-panel)"
                      strokeWidth="2"
                    />
                    <circle cx={MARGIN.left + plotW + 13} cy={l.y} r="3" fill={l.color} />
                    <text
                      x={MARGIN.left + plotW + 21}
                      y={l.y}
                      dy="0.32em"
                      className="nums fill-ink text-[11px] font-medium"
                    >
                      {formatPercent(l.last.value, 1)}
                    </text>
                  </g>
                ))}

                {hover && (
                  <g aria-hidden="true">
                    <line
                      x1={x(hover.time)}
                      x2={x(hover.time)}
                      y1={MARGIN.top}
                      y2={MARGIN.top + plotH}
                      stroke="var(--color-ink-3)"
                      strokeWidth="1"
                    />
                    {hover.rows.map((r) => (
                      <circle
                        key={r.key}
                        cx={x(r.point.time)}
                        cy={y(r.point.value)}
                        r="4"
                        fill={r.color}
                        stroke="var(--color-panel)"
                        strokeWidth="2"
                      />
                    ))}
                  </g>
                )}
              </svg>

              {hover && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)]"
                  style={
                    x(hover.time) > width / 2
                      ? { right: width - x(hover.time) + 12 }
                      : { left: x(hover.time) + 12 }
                  }
                >
                  <p className="mb-1.5 text-ink-3">{fmtDate(hover.time)}</p>
                  {hover.rows.map((r) => (
                    <p key={r.key} className="flex items-center justify-between gap-4 py-0.5">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <span className="size-2 rounded-full" style={{ background: r.color }} />
                        {r.label}
                      </span>
                      <span className="nums text-ink">{formatPercent(r.point.value)}</span>
                    </p>
                  ))}
                </div>
              )}

              {loading && lines.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
                  Loading prices…
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-3">
            Change in closing price since the start of the period. Shows the first five watchlist
            assets.
          </p>
        </>
      )}
    </Panel>
  )
}
