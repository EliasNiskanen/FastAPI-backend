import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * One instrument on the dashboard. Panels sit edge to edge inside the desk
 * frame, separated by hairlines, like the dials of a single instrument cluster.
 */
export function Panel({
  title,
  actions,
  children,
  className,
  id,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, '-')}-title`
  return (
    <section
      aria-labelledby={headingId}
      id={id}
      className={clsx('flex min-w-0 flex-col bg-panel p-5 sm:p-6', className)}
    >
      <header className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-[0.95rem] font-semibold tracking-[0.01em] text-ink">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** A short message inside a panel: loading problems, empty states, stale data. */
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
          className="mr-2 inline-block size-1.5 translate-y-[-2px] rounded-full bg-signal"
        />
      )}
      {children}
    </p>
  )
}
