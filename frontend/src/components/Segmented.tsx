import clsx from 'clsx'

/** A small row of mutually exclusive options (range, quote currency, market mode). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'sm',
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="tone flex rounded-full bg-raised p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'nums rounded-full font-medium whitespace-nowrap transition-colors duration-300',
              size === 'md' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs',
              active ? 'bg-accent text-ground shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
