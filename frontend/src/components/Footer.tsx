import { Logo } from './Logo'

/** Data sources, attribution and the author. */
export function Footer() {
  return (
    <footer className="mx-auto mt-24 max-w-[1240px] px-4 pb-14 sm:px-6">
      <div className="tone grid gap-8 border-t border-line pt-10 text-sm text-ink-3 md:grid-cols-[1fr_2fr]">
        <div className="text-ink-2">
          <Logo />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <p className="max-w-[46ch] leading-relaxed">
            Crypto prices come from Binance. US stock prices are paused until BullBearScope has a
            commercial data licence. Charts by{' '}
            <a
              className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
              href="https://www.tradingview.com/"
            >
              TradingView
            </a>
            . Not investment advice.
          </p>
          <p className="leading-relaxed">
            Built by Elias Niskanen with FastAPI, PostgreSQL and React.{' '}
            <a
              className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
              href="https://github.com/EliasNiskanen/BullBearScope"
            >
              View the source on GitHub
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  )
}
