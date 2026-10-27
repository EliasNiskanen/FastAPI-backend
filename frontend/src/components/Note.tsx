import clsx from 'clsx'
import type { ReactNode } from 'react'

/** A short message: loading problems, empty states, stale data. */
export function Note({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'warn'
}) {
  return (
    <p
      role={tone === 'warn' ? 'status' : undefined}
      className={clsx('text-sm leading-relaxed', tone === 'warn' ? 'text-ink-2' : 'text-ink-3')}
    >
      {tone === 'warn' && (
        <span
          aria-hidden="true"
          className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full bg-accent"
        />
      )}
      {children}
    </p>
  )
}
