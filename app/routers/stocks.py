"""HTTP endpoints for stock prices (Alpha Vantage), e.g. GET /api/stocks/IBM."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.routers.deps import Limit, require_ingest_token
from app.schemas import IngestResult, PriceBarOut, PriceSeriesOut
from app.services import prices
from app.services.alphavantage import AlphaVantageClient
from app.services.market import Interval

router = APIRouter(prefix="/api", tags=["stocks"])

Symbol = Annotated[str, Path(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9.\-:]+$")]


def get_fetcher(settings: Annotated[Settings, Depends(get_settings)]) -> prices.FetchBars:
    """Dependency so tests can swap in a fake API."""
    return AlphaVantageClient(settings).fetch_bars


@router.get("/stocks/{symbol}", response_model=PriceSeriesOut)
def read_prices(
    symbol: Symbol,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    fetch: Annotated[prices.FetchBars, Depends(get_fetcher)],
    interval: Interval = "5min",
    limit: Limit = 500,
) -> PriceSeriesOut:
    """Stock price bars from our own database, refreshed from Alpha Vantage only when stale."""
    sym = prices.normalize_symbol(symbol)
    ttl = (
        settings.stock_long_ttl_minutes
        if interval in ("weekly", "monthly")
        else settings.cache_ttl_minutes
    )
    result = prices.get_bars(session, fetch, "stock", sym, interval, ttl, limit)
    return PriceSeriesOut(
        asset_class="stock",
        symbol=sym,
        interval=result.interval,
        stale=result.stale,
        bars=[PriceBarOut.model_validate(b) for b in result.bars],
    )


@router.post(
    "/ingest/{symbol}",
    response_model=IngestResult,
    dependencies=[Depends(require_ingest_token)],
)
def ingest_prices(
    symbol: Symbol,
    session: Annotated[Session, Depends(get_session)],
    fetch: Annotated[prices.FetchBars, Depends(get_fetcher)],
    interval: Interval = "5min",
) -> IngestResult:
    """Force a stock fetch from Alpha Vantage. Meant for a scheduler."""
    sym = prices.normalize_symbol(symbol)
    new = prices.ingest(session, fetch, "stock", sym, interval)
    return IngestResult(asset_class="stock", symbol=sym, interval=interval, new_bars=new)
