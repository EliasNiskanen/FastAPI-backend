import { useEffect, useRef, useState } from 'react'

import { CompareChart } from './components/CompareChart'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { MarketView } from './components/MarketView'
import { PriceChart } from './components/PriceChart'
import { Snapshot } from './components/Snapshot'
import { Watchlist } from './components/Watchlist'
import type { Asset } from './lib/asset'
import { useSelectedAsset, useWatchlist } from './lib/state'

export default function App() {
  const [asset, select] = useSelectedAsset()
  const watchlist = useWatchlist()
  const heroSearchRef = useRef<HTMLDivElement>(null)
  const deskRef = useRef<HTMLElement>(null)
  const [heroSearchVisible, setHeroSearchVisible] = useState(true)

  // Show the header's compact search only after the hero's search scrolls out of view.
  useEffect(() => {
    const el = heroSearchRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setHeroSearchVisible(entry.isIntersecting),
      {
        rootMargin: '-64px 0px 0px 0px',
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Open an asset on the dashboard and bring the dashboard into view. */
  function open(next: Asset) {
    select(next)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    deskRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <>
      <a
        href="#desk"
        className="sr-only z-50 rounded-md bg-raised px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to dashboard
      </a>
      <Header onSelect={open} showSearch={!heroSearchVisible} />
      <main>
        <Hero onSelect={open} searchRef={heroSearchRef} />

        <section
          id="desk"
          ref={deskRef}
          aria-label="Dashboard"
          className="mx-auto max-w-[1440px] scroll-mt-20 px-4 sm:px-8"
        >
          <div className="grid gap-px overflow-hidden rounded-[22px] border border-line bg-line lg:grid-cols-12">
            <Snapshot
              asset={asset}
              onSelect={select}
              watched={watchlist.has(asset)}
              onToggleWatch={() => watchlist.toggle(asset)}
            />
            <PriceChart asset={asset} />
            <MarketView selected={asset} onSelect={select} />
            <Watchlist
              items={watchlist.items}
              selected={asset}
              onSelect={select}
              onRemove={watchlist.toggle}
            />
            <CompareChart assets={watchlist.items} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
