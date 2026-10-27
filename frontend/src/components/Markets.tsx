import { useState } from 'react'

import { useCryptoOverview, useMovers } from '../api/hooks'
import type { Asset } from '../lib/asset'
import { STOCKS_ENABLED } from '../lib/features'
import { useMode } from '../lib/prefs'
import { MarketList, Sheet } from './MarketCard'
import { Reveal } from './Reveal'
import { Segmented } from './Segmented'

type Side = 'gainers' | 'losers'

const SIDES: { value: Side; label: string }[] = [
  { value: 'gainers', label: 'Rising' },
  { value: 'losers', label: 'Falling' },
]

/** Rising or falling assets of one market, with a switch between the two. */
function MoversSheet({
  kind,
  title,
  onOpen,
}: {
  kind: Asset['kind']
  title: string
  onOpen: (a: Asset) => void
}) {
  const [side, setSide] = useState<Side>('gainers')
  const movers = useMovers(kind, 8)
  return (
    <Sheet
      title={title}
      actions={
        <Segmented
          label={`${title}: rising or falling`}
          value={side}
          onChange={setSide}
          options={SIDES}
        />
      }
    >
      <MarketList
        items={movers.data?.[side]}
        loading={movers.isPending}
        error={movers.error}
        stale={movers.data?.stale}
        onOpen={onOpen}
        what="movers"
      />
    </Sheet>
  )
}

/** One side (rising or falling) of one market. */
function SideSheet({
  kind,
  side,
  title,
  onOpen,
}: {
  kind: Asset['kind']
  side: Side
  title: string
  onOpen: (a: Asset) => void
}) {
  const movers = useMovers(kind, 8)
  return (
    <Sheet title={title}>
      <MarketList
        items={movers.data?.[side]}
        loading={movers.isPending}
        error={movers.error}
        stale={movers.data?.stale}
        onOpen={onOpen}
        what="movers"
      />
    </Sheet>
  )
}

/** The best-known coins at a glance. */
function MajorsSheet({ onOpen }: { onOpen: (a: Asset) => void }) {
  const overview = useCryptoOverview()
  return (
    <Sheet title="Major coins">
      <MarketList
        items={overview.data?.items}
        loading={overview.isPending}
        error={overview.error}
        stale={overview.data?.stale}
        onOpen={onOpen}
        what="market data"
        rows={8}
      />
    </Sheet>
  )
}

/**
 * Today's market as lists. What is shown depends on the market mode:
 * both markets side by side, or one market in more depth. While stock
 * prices are paused, "All" shows crypto and "Stocks" shows nothing here.
 */
export function Markets({ onOpen }: { onOpen: (a: Asset) => void }) {
  const mode = useMode()
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6" key={mode}>
      {mode === 'all' && !STOCKS_ENABLED && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <MoversSheet kind="crypto" title="Crypto movers" onOpen={onOpen} />
          </Reveal>
          <Reveal delay={120}>
            <MajorsSheet onOpen={onOpen} />
          </Reveal>
        </div>
      )}
      {mode === 'all' && STOCKS_ENABLED && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <MoversSheet kind="crypto" title="Crypto" onOpen={onOpen} />
          </Reveal>
          <Reveal delay={120}>
            <MoversSheet kind="stock" title="US stocks" onOpen={onOpen} />
          </Reveal>
        </div>
      )}
      {mode === 'crypto' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Reveal>
            <SideSheet kind="crypto" side="gainers" title="Rising" onOpen={onOpen} />
          </Reveal>
          <Reveal delay={120}>
            <SideSheet kind="crypto" side="losers" title="Falling" onOpen={onOpen} />
          </Reveal>
          <Reveal delay={240}>
            <MajorsSheet onOpen={onOpen} />
          </Reveal>
        </div>
      )}
      {mode === 'stock' && STOCKS_ENABLED && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <SideSheet kind="stock" side="gainers" title="Rising" onOpen={onOpen} />
          </Reveal>
          <Reveal delay={120}>
            <SideSheet kind="stock" side="losers" title="Falling" onOpen={onOpen} />
          </Reveal>
        </div>
      )}
    </div>
  )
}
