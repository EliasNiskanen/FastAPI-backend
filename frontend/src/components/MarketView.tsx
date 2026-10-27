import clsx from 'clsx'
import { useEffect } from 'react'

import { useCryptoOverview } from '../api/hooks'
import { sameAsset, type Asset } from '../lib/asset'
import { errorMessage, STALE_NOTE } from '../lib/errors'
import { formatCompact, formatPrice } from '../lib/format'
import { rememberName } from '../lib/names'
import { Change } from './Change'
import { Note, Panel } from './Panel'

/** The major coins at a glance: price, 24h change and 24h trading volume. Click a row to open it. */
export function MarketView({
  selected,
  onSelect,
}: {
  selected: Asset
  onSelect: (a: Asset) => void
}) {
  const overview = useCryptoOverview()

  useEffect(() => {
    overview.data?.items.forEach((i) =>
      rememberName({ kind: 'crypto', symbol: i.symbol, quote: i.quote ?? 'USDT' }, i.name),
    )
  }, [overview.data])

  return (
    <Panel title="Crypto market" className="lg:col-span-3">
      {overview.isError ? (
        <Note tone="warn">{errorMessage(overview.error, 'market data')}</Note>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">
            Major coins, priced in USDT, with 24-hour change and volume
          </caption>
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th scope="col" className="pb-2 font-normal">
                Coin
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                24h
              </th>
              <th
                scope="col"
                className="hidden pb-2 text-right font-normal sm:table-cell lg:hidden 2xl:table-cell"
              >
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.isPending
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan={4} className="py-2">
                      <div className="h-5 animate-pulse rounded bg-raised" />
                    </td>
                  </tr>
                ))
              : overview.data.items.map((item) => {
                  const asset: Asset = {
                    kind: 'crypto',
                    symbol: item.symbol,
                    quote: item.quote ?? 'USDT',
                  }
                  const active = sameAsset(asset, selected)
                  return (
                    <tr
                      key={item.symbol}
                      className={clsx(
                        'group cursor-pointer border-t border-line/60',
                        active && 'bg-raised/60',
                      )}
                      onClick={() => onSelect(asset)}
                    >
                      <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelect(asset)
                          }}
                          aria-current={active ? 'true' : undefined}
                          className="relative font-semibold font-wide tracking-wide text-ink group-hover:text-ink"
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="absolute top-1/2 -left-3 h-4 w-0.5 -translate-y-1/2 bg-signal"
                            />
                          )}
                          {item.symbol}
                        </button>
                      </th>
                      <td className="nums py-2.5 text-right text-ink">
                        {formatPrice(item.price, 'USD')}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <Change percent={item.change_percent} />
                      </td>
                      <td className="nums hidden py-2.5 pl-3 text-right text-ink-2 sm:table-cell lg:hidden 2xl:table-cell">
                        {formatCompact(item.volume)}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      )}
      {overview.data?.stale && (
        <div className="mt-4">
          <Note tone="warn">{STALE_NOTE}</Note>
        </div>
      )}
      <p className="mt-auto pt-5 text-xs text-ink-3">
        Prices in USDT from Binance, 24-hour change.
      </p>
    </Panel>
  )
}
