from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.schemas import IngestResult, PriceBarOut, PriceSeriesOut
from app.services import prices
from app.services.alphavantage import SUPPORTED_INTERVALS, AlphaVantageClient

router = APIRouter(prefix="/api", tags=["stocks"])

Interval = Literal["1min", "5min", "15min", "30min", "60min", "daily"]
assert set(get_args(Interval)) == set(SUPPORTED_INTERVALS)

Symbol = Annotated[str, Path(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9.\-:]+$")]


def get_fetcher(settings: Annotated[Settings, Depends(get_settings)]) -> prices.FetchBars:
    """Dependency so tests can swap in a fake API."""
    return AlphaVantageClient(settings).fetch_bars


def require_ingest_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ingest_token: Annotated[str | None, Header()] = None,
) -> None:
    if settings.ingest_token and x_ingest_token != settings.ingest_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest token")


@router.get("/stocks/{symbol}", response_model=PriceSeriesOut)
def read_prices(
    symbol: Symbol,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    fetch: Annotated[prices.FetchBars, Depends(get_fetcher)],
    interval: Interval = "5min",
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> PriceSeriesOut:
    """Price bars from our own database, refreshed from Alpha Vantage only when stale."""
    sym = prices.normalize_symbol(symbol)
    bars = prices.get_bars(session, fetch, sym, interval, settings.cache_ttl_minutes, limit)
    return PriceSeriesOut(
        symbol=sym, interval=interval, bars=[PriceBarOut.model_validate(b) for b in bars]
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
    """Force a fetch from Alpha Vantage. Meant for a scheduler (Cloud Scheduler / EventBridge)."""
    sym = prices.normalize_symbol(symbol)
    new = prices.ingest(session, fetch, sym, interval)
    return IngestResult(symbol=sym, interval=interval, new_bars=new)
