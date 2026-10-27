import clsx from 'clsx'

import type { Asset } from '../lib/asset'
import { kindsFor, useMode } from '../lib/prefs'
import { Logo } from './Logo'
import { ModeSwitch } from './ModeSwitch'
import { SearchBox } from './SearchBox'
import { ThemeToggle } from './ThemeToggle'

/**
 * A floating bar that stays in view: logo, market switch, theme toggle and,
 * once the big search has scrolled away, a compact search.
 */
export function Header({
  onOpen,
  showSearch,
}: {
  onOpen: (a: Asset) => void
  showSearch: boolean
}) {
  const mode = useMode()
  return (
    <header className="pointer-events-none sticky top-3 z-40 px-3 sm:top-4 sm:px-6">
      <div className="tone float-shadow pointer-events-auto mx-auto flex h-14 max-w-[1240px] items-center gap-3 rounded-full border border-line bg-panel/80 pr-2 pl-5 backdrop-blur-xl sm:gap-5">
        <a href="./" className="tone shrink-0 text-ink" aria-label="BullBearScope home">
          {/* On phones the wordmark makes room for the compact search. */}
          <Logo
            className={clsx(
              showSearch && '[&>span:last-child]:hidden sm:[&>span:last-child]:inline',
            )}
          />
        </a>
        <div className="hidden md:block">
          <ModeSwitch />
        </div>
        <div
          className={clsx(
            'mx-auto min-w-0 max-w-sm flex-1 transition-opacity duration-300',
            showSearch ? 'opacity-100' : 'pointer-events-none opacity-0 max-sm:hidden',
          )}
          aria-hidden={!showSearch}
          inert={!showSearch}
        >
          <SearchBox onSelect={onOpen} size="compact" kinds={kindsFor(mode)} />
        </div>
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
      <div className="pointer-events-auto mt-2 flex justify-center md:hidden">
        <div className="tone float-shadow rounded-full border border-line bg-panel/80 p-0.5 backdrop-blur-xl">
          <ModeSwitch />
        </div>
      </div>
    </header>
  )
}
