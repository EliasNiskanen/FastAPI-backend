import { STOCKS_PAUSED_SHORT } from '../lib/features'
import { setMode } from '../lib/prefs'

/** A slim notice on the front page: stock prices are paused, crypto works. */
export function StocksPausedBanner() {
  return (
    <p
      role="status"
      className="tone mx-auto flex w-fit max-w-full items-center gap-2.5 rounded-full border border-line bg-panel/70 px-4 py-1.5 text-sm text-ink-2 backdrop-blur"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
      {STOCKS_PAUSED_SHORT}
    </p>
  )
}

/** Why stock prices are missing, and that they are meant to come back. */
export function StocksPausedNotice({
  compact = false,
  onBrowseCrypto = () => setMode('crypto'),
}: {
  compact?: boolean
  onBrowseCrypto?: () => void
}) {
  return (
    <div className={compact ? 'max-w-[52ch]' : 'mx-auto max-w-[46ch] text-center'}>
      <p className="text-lg leading-relaxed text-ink-2">
        Showing stock prices on a public website needs a commercial data licence, and no free stock
        data plan includes one. US stocks will be back as soon as BullBearScope has funding for a
        licence.
      </p>
      <p className="mt-4 leading-relaxed text-ink-3">
        Until then, crypto prices from Binance work as usual: movers, charts, comparison and your
        watchlist.
      </p>
      <button
        type="button"
        onClick={onBrowseCrypto}
        className="tone mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-ground hover:opacity-90"
      >
        Browse crypto
      </button>
    </div>
  )
}
