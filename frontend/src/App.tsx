import { useEffect, useRef, useState } from 'react'

import { AssetDialog } from './components/AssetDialog'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Markets } from './components/Markets'
import { Reveal } from './components/Reveal'
import { Ribbon } from './components/Ribbon'
import { Watchlist } from './components/Watchlist'
import { useMode } from './lib/prefs'
import { useOpenAsset, useWatchlist } from './lib/state'

export default function App() {
  const [asset, open] = useOpenAsset()
  const watchlist = useWatchlist()
  const mode = useMode()
  const heroSearchRef = useRef<HTMLDivElement>(null)
  const [heroSearchVisible, setHeroSearchVisible] = useState(true)

  // The header's compact search appears once the big search scrolls away.
  useEffect(() => {
    const el = heroSearchRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setHeroSearchVisible(entry.isIntersecting),
      {
        rootMargin: '-80px 0px 0px 0px',
      },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the browser's theme colour (mobile address bar) in step with the page.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()
    if (meta && ground) meta.setAttribute('content', ground)
  })

  return (
    <>
      <a
        href="#markets"
        className="sr-only z-50 rounded-full bg-raised px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to markets
      </a>
      <Header onOpen={open} showSearch={!heroSearchVisible} />
      <main>
        <Hero onOpen={open} searchRef={heroSearchRef} />
        <Reveal>
          <Ribbon onOpen={open} />
        </Reveal>
        <div id="markets" className="mt-14 scroll-mt-24 space-y-6">
          <Markets onOpen={open} />
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6" key={`watch-${mode}`}>
            <Reveal>
              <Watchlist items={watchlist.items} onOpen={open} onRemove={watchlist.toggle} />
            </Reveal>
          </div>
        </div>
      </main>
      <Footer />
      <AssetDialog
        asset={asset}
        onClose={() => open(null)}
        onSwitch={open}
        watched={asset ? watchlist.has(asset) : false}
        onToggleWatch={() => asset && watchlist.toggle(asset)}
      />
    </>
  )
}
