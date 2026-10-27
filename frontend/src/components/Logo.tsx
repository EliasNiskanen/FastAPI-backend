/**
 * The BullBearScope mark: a scope's reticle with a rising line inside it.
 * The line takes the current mode's accent colour.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0">
        <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M16 3.5v4.5M16 24v4.5M3.5 16H8M24 16h4.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m11 19 3.2-3.2 2.3 2.2 4.5-5"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="tone"
        />
      </svg>
      <span className="font-wide text-[1.05rem] font-[720] tracking-[-0.015em]">BullBearScope</span>
    </span>
  )
}
