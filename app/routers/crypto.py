"""HTTP endpoints for crypto prices (Binance), e.g. GET /api/crypto/BTC?quote=EUR."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.routers.deps import Limit, require_ingest_token
from app.schemas import IngestResult, PriceBarOut, PriceSeriesOut
from app.services import prices
from app.services.binance import BinanceClient
from app.services.market import Interval

router = APIRouter(prefix="/api", tags=["crypto"])

Base = Annotated[
    str, Path(min_length=2, max_length=12, pattern=r"^[A-Za-z0-9]+$", examples=["BTC"])
]
Quote = Annotated[
    str | None,
    Query(
        min_length=2,
        max_length=12,
        pattern=r"^[A-Za-z0-9]+$",
        description="Quote currency, e.g. USDT or EUR. Defaults to DEFAULT_CRYPTO_QUOTE.",
    ),
]


def get_crypto_fetcher(settings: Annotated[Settings, Depends(get_settings)]) -> prices.FetchBars:
    """Dependency so tests can swap in a fake API."""
    return BinanceClient(settings).fetch_bars


def _pair(base: str, quote: str | None, settings: Settings) -> str:
    """Build the Binance trading pair from base and quote currency, e.g. ('btc', 'eur') -> 'BTCEUR'."""
    return prices.normalize_symbol(base) + prices.normalize_symbol(
        quote or settings.default_crypto_quote
    )


@router.get("/crypto/{base}", response_model=PriceSeriesOut)
def read_crypto_prices(
    base: Base,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    fetch: Annotated[prices.FetchBars, Depends(get_crypto_fetcher)],
    quote: Quote = None,
    interval: Interval = "5min",
    limit: Limit = 500,
) -> PriceSeriesOut:
    """Crypto candles (e.g. BTC in USDT) from our database, refreshed from Binance when stale."""
    pair = _pair(base, quote, settings)
    bars = prices.get_bars(
        session, fetch, "crypto", pair, interval, settings.crypto_cache_ttl_minutes, limit
    )
    return PriceSeriesOut(
        asset_class="crypto",
        symbol=pair,
        interval=interval,
        bars=[PriceBarOut.model_validate(b) for b in bars],
    )


@router.post(
    "/ingest/crypto/{base}",
    response_model=IngestResult,
    dependencies=[Depends(require_ingest_token)],
)
def ingest_crypto_prices(
    base: Base,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    fetch: Annotated[prices.FetchBars, Depends(get_crypto_fetcher)],
    quote: Quote = None,
    interval: Interval = "5min",
) -> IngestResult:
    """Force a fetch from Binance (up to 1000 latest candles). Meant for a scheduler."""
    pair = _pair(base, quote, settings)
    new = prices.ingest(session, fetch, "crypto", pair, interval)
    return IngestResult(asset_class="crypto", symbol=pair, interval=interval, new_bars=new)
