import { direction } from '../lib/format'

/** A tiny line of recent closing prices, coloured by whether the period ended up or down. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  if (values.length < 2) return <svg aria-hidden="true" width={width} height={height} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const dir = direction(values.at(-1)! - values[0])
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={dir === 'up' ? 'stroke-up' : dir === 'down' ? 'stroke-down' : 'stroke-ink-3'}
      />
    </svg>
  )
}
