import clsx from 'clsx'

import type { Asset } from '../lib/asset'
import { SearchBox } from './SearchBox'

/** The Redline mark: a gauge arc with the needle in the red zone. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
        <path
          d="M5 23a11 11 0 0 1 22 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M22 13.4 25.4 10"
          stroke="var(--color-signal)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="16" cy="23" r="2" fill="currentColor" />
        <path d="M16 23 22.5 15.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="font-wide text-lg font-[720] tracking-[-0.01em]">Redline</span>
    </span>
  )
}

/** Top bar. Its compact search appears once the big search in the hero has scrolled away. */
export function Header({
  onSelect,
  showSearch,
}: {
  onSelect: (a: Asset) => void
  showSearch: boolean
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ground/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 sm:px-8">
        <a href="/" className="shrink-0 text-ink" aria-label="Redline home">
          <Logo />
        </a>
        <div
          className={clsx(
            'mx-auto max-w-md min-w-0 flex-1 transition-opacity duration-200',
            showSearch ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-hidden={!showSearch}
          inert={!showSearch}
        >
          <SearchBox onSelect={onSelect} size="compact" />
        </div>
        <nav
          aria-label="Main"
          className="hidden shrink-0 items-center gap-6 text-sm text-ink-2 md:flex"
        >
          <a href="#desk" className="hover:text-ink">
            Dashboard
          </a>
          <a href="#watchlist" className="hover:text-ink">
            Watchlist
          </a>
          <a href="https://github.com/EliasNiskanen/FastAPI-backend" className="hover:text-ink">
            Source
          </a>
        </nav>
      </div>
    </header>
  )
}
