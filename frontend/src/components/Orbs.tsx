/**
 * Two large, blurred fields of the current mode's colours drifting slowly
 * behind the hero (gold and blue for crypto, red and grey for all markets,
 * blue and grey for stocks). Purely decorative; still when the viewer
 * prefers reduced motion.
 */
export function Orbs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="tone absolute top-[-18%] left-[8%] size-[min(70vw,640px)] rounded-full blur-[90px]"
        style={{
          background: 'var(--orb-1)',
          opacity: 'var(--orb-opacity)',
          animation: 'drift-a 26s ease-in-out infinite alternate',
        }}
      />
      <div
        className="tone absolute top-[10%] right-[2%] size-[min(60vw,560px)] rounded-full blur-[100px]"
        style={{
          background: 'var(--orb-2)',
          opacity: 'var(--orb-opacity)',
          animation: 'drift-b 32s ease-in-out infinite alternate',
        }}
      />
    </div>
  )
}
