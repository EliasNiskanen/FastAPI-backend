import type { MarketItem } from '../api/client'
import { useBars } from '../api/hooks'
import { DEFAULT_QUOTE } from '../lib/asset'
import { direction, formatPrice } from '../lib/format'

const W = 520
const H = 240

/**
 * The headline coin's last 24 hours as one long line: the chart that goes with
 * the story. Hourly closes, the latest price marked at the end.
 */
export function HeroChart({ item }: { item: MarketItem }) {
  const bars = useBars(
    { kind: 'crypto', symbol: item.symbol, quote: item.quote ?? DEFAULT_QUOTE },
    '60min',
    25,
  )
  const closes = (bars.data?.bars ?? []).map((b) => b.close)
  if (closes.length < 2) return <div aria-hidden="true" className="h-[240px]" />

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const px = (i: number) => (i / (closes.length - 1)) * (W - 8) + 4
  const py = (v: number) => 16 + (1 - (v - min) / span) * (H - 48)
  const path = closes
    .map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`)
    .join('')
  const dir = direction(closes.at(-1)! - closes[0])
  const stroke = dir === 'down' ? 'var(--color-down)' : 'var(--color-up)'
  const lastX = px(closes.length - 1)
  const lastY = py(closes.at(-1)!)
  const currency = item.quote ?? DEFAULT_QUOTE

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`${item.symbol} over the last 24 hours, from ${formatPrice(closes[0], currency)} to ${formatPrice(closes.at(-1)!, currency)}`}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={16 + f * (H - 48)}
            y2={16 + f * (H - 48)}
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={lastX}
          cy={lastY}
          r="4.5"
          fill={stroke}
          stroke="var(--color-ground)"
          strokeWidth="3"
        />
        <text x="0" y={H - 6} className="fill-ink-3 text-[13px]">
          24 hours ago
        </text>
        <text x={W} y={H - 6} textAnchor="end" className="nums fill-ink-2 text-[13px]">
          Now {formatPrice(closes.at(-1)!, currency)}
        </text>
      </svg>
    </figure>
  )
}
