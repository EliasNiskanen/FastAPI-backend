import clsx from 'clsx'

import { direction, formatChange, formatPercent } from '../lib/format'

/**
 * A price change: arrow + number, coloured by direction. The arrow and sign
 * carry the meaning too, so it reads correctly without colour.
 */
export function Change({
  percent,
  absolute,
  className,
}: {
  percent: number
  absolute?: number
  className?: string
}) {
  const dir = direction(percent)
  return (
    <span
      className={clsx(
        'nums inline-flex items-baseline gap-1 whitespace-nowrap',
        dir === 'up' && 'text-up',
        dir === 'down' && 'text-down',
        dir === 'flat' && 'text-ink-2',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[0.7em]">
        {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}
      </span>
      <span>
        <span className="sr-only">
          {dir === 'up' ? 'Up ' : dir === 'down' ? 'Down ' : 'Unchanged '}
        </span>
        {formatPercent(percent)}
        {absolute !== undefined && <span className="text-ink-2"> ({formatChange(absolute)})</span>}
      </span>
    </span>
  )
}
