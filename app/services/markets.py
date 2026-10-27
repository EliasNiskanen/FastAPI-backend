"""Market-wide data: top movers, the crypto market overview and symbol search.

Everything here goes through the database-backed cache in cache.py, so the
external APIs are called at most once per TTL no matter how many people use
the app:

- crypto: one Binance request returns 24h stats for every pair. Movers, the
  overview table and crypto search are all derived from that one response.
- stock movers: one Alpha Vantage TOP_GAINERS_LOSERS request per TTL (hours,
  because the free key has a small daily quota).
- stock search: Alpha Vantage's full list of listed symbols, refreshed weekly.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.services.cache import Cached, get_cached, peek
from app.services.market import ExternalAPIError

# Stablecoins and fiat tokens move ~0% against USDT; they would only add noise
# to movers and search.
STABLE_BASES = frozenset(
    {"USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "EUR", "EURI", "AEUR", "USDE",
     "PYUSD", "USD1", "XUSD", "BFUSD", "RLUSD", "USDS", "GBP", "TRY", "BRL"}
)  # fmt: skip

# Display names for well-known coins (Binance only provides tickers).
CRYPTO_NAMES = {
    "BTC": "Bitcoin", "ETH": "Ethereum", "BNB": "BNB", "SOL": "Solana", "XRP": "XRP",
    "DOGE": "Dogecoin", "ADA": "Cardano", "TRX": "TRON", "AVAX": "Avalanche",
    "LINK": "Chainlink", "DOT": "Polkadot", "POL": "Polygon", "LTC": "Litecoin",
    "BCH": "Bitcoin Cash", "SHIB": "Shiba Inu", "TON": "Toncoin", "XLM": "Stellar",
    "ATOM": "Cosmos", "NEAR": "NEAR Protocol", "APT": "Aptos", "ARB": "Arbitrum",
    "OP": "Optimism", "SUI": "Sui", "PEPE": "Pepe", "UNI": "Uniswap",
    "ETC": "Ethereum Classic", "FIL": "Filecoin", "ICP": "Internet Computer",
    "HBAR": "Hedera", "AAVE": "Aave", "INJ": "Injective", "RENDER": "Render",
    "TAO": "Bittensor", "SEI": "Sei", "WLD": "Worldcoin", "FET": "Fetch.ai",
    "ALGO": "Algorand", "VET": "VeChain", "XMR": "Monero", "TIA": "Celestia",
}  # fmt: skip

# Shown in the market overview when the client does not ask for specific coins.
DEFAULT_MAJORS = ("BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT")

# Stock movers are dominated by penny stocks and warrants; keep real companies.
_PLAIN_TICKER = re.compile(r"^[A-Z]{1,5}$")
MIN_STOCK_MOVER_PRICE = 1.0
MIN_STOCK_MOVER_VOLUME = 100_000


@dataclass(frozen=True)
class MarketSources:
    """The external calls this module needs. Tests replace them with fakes."""

    crypto_tickers: Callable[[], list[dict]]  # Binance /ticker/24hr rows
    stock_movers: Callable[[], dict]  # AlphaVantageClient.fetch_top_movers
    stock_listing: Callable[[], list[list[str]]]  # AlphaVantageClient.fetch_listing


# ---------------------------------------------------------------- crypto


def _compact_tickers(rows: list[dict], quote: str) -> list[dict]:
    """Keep pairs quoted in `quote` (e.g. BTCUSDT), drop stablecoins, convert to our fields."""
    out = []
    for row in rows:
        symbol = str(row.get("symbol", ""))
        if not symbol.endswith(quote) or len(symbol) <= len(quote):
            continue
        base = symbol[: -len(quote)]
        if base in STABLE_BASES:
            continue
        try:
            price = float(row["lastPrice"])
            volume = float(row["quoteVolume"])
            if price <= 0 or volume <= 0:
                continue  # delisted or halted pair
            out.append(
                {
                    "symbol": base,
                    "quote": quote,
                    "name": CRYPTO_NAMES.get(base),
                    "price": price,
                    "change": float(row["priceChange"]),
                    "change_percent": float(row["priceChangePercent"]),
                    "high": float(row["highPrice"]),
                    "low": float(row["lowPrice"]),
                    "volume": volume,  # 24h turnover in the quote currency
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    out.sort(key=lambda t: t["volume"], reverse=True)
    return out


def crypto_tickers(session: Session, sources: MarketSources, settings: Settings) -> Cached:
    """24h stats for every actively traded crypto pair in the default quote currency."""
    quote = settings.default_crypto_quote.upper()
    return get_cached(
        session,
        f"crypto:tickers:{quote}",
        settings.crypto_cache_ttl_minutes,
        lambda: _compact_tickers(sources.crypto_tickers(), quote),
    )


def _tokenized_stock_filter(session: Session) -> Callable[[str], bool]:
    """A test for "this Binance asset is a tokenized US stock, not a coin".

    Binance lists tokenized stocks as the stock's ticker plus "B" (MU -> MUB,
    CRCL -> CRCLB). Binance's data has no reliable flag for them, so match that
    pattern against the cached US stock list. Known coins are never excluded
    (BNB stays, although BN is also a NYSE ticker). Until the stock list has
    been cached (by the first search), nothing is filtered.
    """
    stocks = {row[0] for row in peek(session, "stock:listing") or []}

    def is_tokenized(base: str) -> bool:
        """True if `base` looks like a tokenized stock."""
        return (
            base not in CRYPTO_NAMES
            and len(base) >= 3
            and base.endswith("B")
            and base[:-1] in stocks
        )

    return is_tokenized


def crypto_movers(
    session: Session, sources: MarketSources, settings: Settings, limit: int
) -> tuple[Cached, list[dict], list[dict]]:
    """Biggest 24h gainers and losers among liquid coins (enough trading volume)."""
    cached = crypto_tickers(session, sources, settings)
    tokenized = _tokenized_stock_filter(session)
    liquid = [
        t
        for t in cached.payload
        if t["volume"] >= settings.crypto_movers_min_volume and not tokenized(t["symbol"])
    ]
    ranked = sorted(liquid, key=lambda t: t["change_percent"], reverse=True)
    gainers = [t for t in ranked if t["change_percent"] > 0][:limit]
    losers = [t for t in reversed(ranked) if t["change_percent"] < 0][:limit]
    return cached, gainers, losers


def crypto_overview(
    session: Session, sources: MarketSources, settings: Settings, symbols: list[str]
) -> tuple[Cached, list[dict]]:
    """24h stats for the requested coins, in the requested order (unknown coins skipped)."""
    cached = crypto_tickers(session, sources, settings)
    by_symbol = {t["symbol"]: t for t in cached.payload}
    wanted = [s.upper() for s in symbols] or list(DEFAULT_MAJORS)
    return cached, [by_symbol[s] for s in wanted if s in by_symbol]


# ---------------------------------------------------------------- stocks


def _keep_stock_mover(item: dict) -> bool:
    """Filter out penny stocks, warrants and very thinly traded tickers."""
    return (
        bool(_PLAIN_TICKER.match(item["symbol"]))
        and item["price"] >= MIN_STOCK_MOVER_PRICE
        and item["volume"] >= MIN_STOCK_MOVER_VOLUME
    )


def stock_movers(
    session: Session, sources: MarketSources, settings: Settings, limit: int
) -> tuple[Cached, list[dict], list[dict]]:
    """Today's biggest US stock gainers and losers."""
    cached = get_cached(
        session, "stock:movers", settings.stock_movers_ttl_minutes, sources.stock_movers
    )
    # Company names come from the search listing, but only if it is already
    # cached: movers should not spend an extra Alpha Vantage request on names.
    names = {row[0]: row[1] for row in peek(session, "stock:listing") or []}

    def pick(items: list[dict]) -> list[dict]:
        """Filtered, limited movers with company names added where known."""
        kept = [m for m in items if _keep_stock_mover(m)][:limit]
        return [{**m, "name": names.get(m["symbol"])} for m in kept]

    return cached, pick(cached.payload["gainers"]), pick(cached.payload["losers"])


# ---------------------------------------------------------------- search


def _score(query: str, symbol: str, name: str) -> int | None:
    """Rank a search hit: lower is better, None means no match."""
    name_l = name.lower()
    q = query.lower()
    if symbol.lower() == q:
        return 0
    if symbol.lower().startswith(q):
        return 1
    if name_l.startswith(q):
        return 2
    if any(word.startswith(q) for word in re.split(r"[\s\-.,&]+", name_l)):
        return 3
    if len(q) >= 3 and q in name_l:
        return 4
    return None


def search(
    session: Session, sources: MarketSources, settings: Settings, query: str, limit: int
) -> tuple[list[dict], bool]:
    """Find stocks, ETFs and coins by ticker or name.

    Returns (results, partial). partial=True means one of the sources could not
    be loaded, so results may be incomplete.
    """
    q = query.strip()
    if not q:
        return [], False

    hits: list[tuple[int, int, dict]] = []  # (score, tie-breaker, result)
    partial = False

    # Stocks first: the tokenized-stock filter for coins needs the stock list.
    try:
        listing = get_cached(
            session, "stock:listing", settings.stock_listing_ttl_minutes, sources.stock_listing
        ).payload
    except ExternalAPIError:
        listing, partial = [], True
    for symbol, name, exchange, asset_type in listing:
        score = _score(q, symbol, name)
        if score is not None:
            # Prefer the big exchanges and plain stocks over ETFs on ties.
            tie = (0 if exchange in ("NASDAQ", "NYSE") else 1) * 2 + (asset_type != "Stock")
            hits.append(
                (
                    score,
                    tie * 10_000 + len(symbol),
                    {
                        "asset_class": "stock",
                        "symbol": symbol,
                        "name": name,
                        "exchange": exchange or None,
                        "quote": None,
                    },
                )
            )

    try:
        coins = crypto_tickers(session, sources, settings).payload
    except ExternalAPIError:
        coins, partial = [], True
    tokenized = _tokenized_stock_filter(session)
    for rank, coin in enumerate(coins):  # already sorted by trading volume
        if tokenized(coin["symbol"]):
            continue  # the real stock appears in the stock results
        score = _score(q, coin["symbol"], coin["name"] or "")
        if score is not None:
            hits.append(
                (
                    score,
                    rank,
                    {
                        "asset_class": "crypto",
                        "symbol": coin["symbol"],
                        "name": coin["name"] or coin["symbol"],
                        "exchange": "Binance",
                        "quote": coin["quote"],
                    },
                )
            )

    hits.sort(key=lambda h: (h[0], h[1]))
    return [h[2] for h in hits[:limit]], partial
