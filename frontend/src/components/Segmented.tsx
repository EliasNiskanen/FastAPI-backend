import clsx from 'clsx'

/** A small row of mutually exclusive options (interval, range, quote currency). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-ground p-0.5">
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
              'nums relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
            {active && (
              <span aria-hidden="true" className="absolute inset-x-2.5 -bottom-px h-px bg-signal" />
            )}
          </button>
        )
      })}
    </div>
  )
}
