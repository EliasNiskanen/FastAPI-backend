import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { percentTicks } from '../lib/chart'
import { formatPercent } from '../lib/format'
import type { PercentPoint } from '../lib/series'

export interface PercentSeries {
  key: string
  label: string
  color: string
  points: PercentPoint[]
}

const MARGIN = { top: 14, right: 82, bottom: 28, left: 48 }

/** The point of a line closest to a time. */
function nearest(points: PercentPoint[], t: number): PercentPoint {
  return points.reduce((best, p) => (Math.abs(p.time - t) < Math.abs(best.time - t) ? p : best))
}

/** Size of an element, kept up to date as the layout changes. */
function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 600, height: 360 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Two (or more) assets as percent change since the start of the range, on one
 * shared axis, so a $0.20 coin and a $500 stock are directly comparable.
 * Legend, labelled line ends and a hover readout; every value is also in the
 * readout below the chart, so nothing depends on hovering.
 */
export function PercentChart({ series, intraday }: { series: PercentSeries[]; intraday: boolean }) {
  const [boxRef, { width, height }] = useSize()
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const lines = series.filter((s) => s.points.length > 1)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = Math.max(height - MARGIN.top - MARGIN.bottom, 50)
  const values = lines.flatMap((l) => l.points.map((p) => p.value))
  const ticks = percentTicks(Math.min(0, ...values), Math.max(0, ...values))
  const yMin = ticks[0]
  const yMax = ticks.at(-1)!
  const times = lines.flatMap((l) => [l.points[0].time, l.points.at(-1)!.time])
  const tMin = Math.min(...times)
  const tMax = Math.max(...times, tMin + 60)
  const x = (t: number) => MARGIN.left + ((t - tMin) / (tMax - tMin)) * plotW
  const y = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH

  const fmtTime = (t: number) =>
    new Date(t * 1000).toLocaleString(
      [],
      intraday
        ? { hour: '2-digit', minute: '2-digit' }
        : {
            month: 'short',
            day: 'numeric',
            year: tMax - tMin > 400 * 86400 ? 'numeric' : undefined,
          },
    )

  // Line-end labels, nudged apart so they never overlap.
  const ends = lines
    .map((l) => ({ ...l, last: l.points.at(-1)!, y: 0 }))
    .sort((a, b) => b.last.value - a.last.value)
  let prevY = -Infinity
  for (const e of ends) {
    e.y = Math.max(y(e.last.value), prevY + 16)
    prevY = e.y
  }

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    if (px < MARGIN.left || px > MARGIN.left + plotW) return setHoverTime(null)
    setHoverTime(tMin + ((px - MARGIN.left) / plotW) * (tMax - tMin))
  }

  const hover =
    hoverTime === null || lines.length === 0
      ? null
      : lines.map((l) => ({ ...l, point: nearest(l.points, hoverTime) }))

  return (
    <div className="flex h-full flex-col">
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 rounded-full"
              style={{ background: l.color }}
            />
            {l.label}
          </li>
        ))}
      </ul>
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Percent change: ${ends.map((e) => `${e.label} ${formatPercent(e.last.value)}`).join(', ')}`}
          onPointerMove={onPointer}
          onPointerLeave={() => setHoverTime(null)}
          className="absolute inset-0 touch-pan-y"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? 'var(--ink-3)' : 'var(--line)'}
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
          {[0, 1, 2, 3].map((i) => {
            const t = tMin + ((tMax - tMin) * i) / 3
            return (
              <text
                key={i}
                x={x(t)}
                y={height - 8}
                textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                className="fill-ink-3 text-[11px]"
              >
                {fmtTime(t)}
              </text>
            )
          })}
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
          {ends.map((e) => (
            <g key={e.key}>
              <circle
                cx={x(e.last.time)}
                cy={y(e.last.value)}
                r="3.5"
                fill={e.color}
                stroke="var(--panel)"
                strokeWidth="2"
              />
              <circle cx={MARGIN.left + plotW + 14} cy={e.y} r="3" fill={e.color} />
              <text
                x={MARGIN.left + plotW + 22}
                y={e.y}
                dy="0.32em"
                className="nums fill-ink text-[11px] font-medium"
              >
                {formatPercent(e.last.value, 1)}
              </text>
            </g>
          ))}
          {hover && (
            <g aria-hidden="true">
              <line
                x1={x(hover[0].point.time)}
                x2={x(hover[0].point.time)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                stroke="var(--ink-3)"
              />
              {hover.map((h) => (
                <circle
                  key={h.key}
                  cx={x(h.point.time)}
                  cy={y(h.point.value)}
                  r="4"
                  fill={h.color}
                  stroke="var(--panel)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </svg>
        {hover && (
          <div
            aria-hidden="true"
            className="tone float-shadow pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border border-line bg-panel px-3 py-2 text-xs"
            style={
              x(hover[0].point.time) > width / 2
                ? { right: width - x(hover[0].point.time) + 12 }
                : { left: x(hover[0].point.time) + 12 }
            }
          >
            <p className="mb-1 text-ink-3">{fmtTime(hover[0].point.time)}</p>
            {hover.map((h) => (
              <p key={h.key} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: h.color }} />
                  {h.label}
                </span>
                <span className="nums text-ink">{formatPercent(h.point.value)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
