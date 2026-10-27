"""HTTP endpoints for market-wide data: top movers, crypto overview and search."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.routers.deps import require_stocks_enabled
from app.schemas import CryptoOverviewOut, MarketItem, MoversOut, SearchOut, SearchResult
from app.services import markets
from app.services.alphavantage import AlphaVantageClient
from app.services.binance import BinanceClient
from app.services.market import AssetClass

router = APIRouter(prefix="/api", tags=["market"])


def get_market_sources(
    settings: Annotated[Settings, Depends(get_settings)],
) -> markets.MarketSources:
    """Dependency wiring the real API clients; tests override it with fakes.

    The Alpha Vantage client is created on first use, so crypto endpoints keep
    working even if no Alpha Vantage key is configured.
    """
    binance = BinanceClient(settings)
    return markets.MarketSources(
        crypto_tickers=binance.fetch_24h_tickers,
        stock_movers=lambda: AlphaVantageClient(settings).fetch_top_movers(),
        stock_listing=lambda: AlphaVantageClient(settings).fetch_listing(),
    )


Sources = Annotated[markets.MarketSources, Depends(get_market_sources)]
DbSession = Annotated[Session, Depends(get_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def _item(asset_class: AssetClass, data: dict) -> MarketItem:
    """Build a MarketItem from a cached provider row."""
    return MarketItem(asset_class=asset_class, **data)


@router.get("/market/movers", response_model=MoversOut)
def read_movers(
    session: DbSession,
    sources: Sources,
    settings: AppSettings,
    asset_class: AssetClass = "crypto",
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> MoversOut:
    """Biggest daily gainers and losers: US stocks (Alpha Vantage) or crypto (Binance, 24h)."""
    if asset_class == "crypto":
        cached, gainers, losers = markets.crypto_movers(session, sources, settings, limit)
    else:
        require_stocks_enabled(settings)
        cached, gainers, losers = markets.stock_movers(session, sources, settings, limit)
    return MoversOut(
        asset_class=asset_class,
        as_of=cached.fetched_at,
        stale=cached.stale,
        gainers=[_item(asset_class, g) for g in gainers],
        losers=[_item(asset_class, item) for item in losers],
    )


@router.get("/market/crypto", response_model=CryptoOverviewOut)
def read_crypto_overview(
    session: DbSession,
    sources: Sources,
    settings: AppSettings,
    symbols: Annotated[
        str | None,
        Query(
            pattern=r"^[A-Za-z0-9]+(,[A-Za-z0-9]+){0,29}$",
            description="Comma-separated coins, e.g. BTC,ETH,SOL. Defaults to the major coins.",
        ),
    ] = None,
) -> CryptoOverviewOut:
    """Latest price and 24h change for a list of coins, for overview tables."""
    wanted = symbols.split(",") if symbols else []
    cached, items = markets.crypto_overview(session, sources, settings, wanted)
    return CryptoOverviewOut(
        as_of=cached.fetched_at,
        stale=cached.stale,
        items=[_item("crypto", i) for i in items],
    )


@router.get("/search", response_model=SearchOut)
def search(
    session: DbSession,
    sources: Sources,
    settings: AppSettings,
    q: Annotated[str, Query(min_length=1, max_length=40, description="Ticker or name")],
    limit: Annotated[int, Query(ge=1, le=25)] = 8,
) -> SearchOut:
    """Search coins (and stocks and ETFs when enabled) by ticker or name."""
    results, partial = markets.search(session, sources, settings, q, limit)
    return SearchOut(query=q, partial=partial, results=[SearchResult(**r) for r in results])
