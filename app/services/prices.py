"""Database-first price lookups for stocks and crypto.

Reads come from our own PostgreSQL. The external API is called only when the
stored data for an (asset class, symbol, interval) is older than the TTL, or
when an ingest is forced.

Ingest upserts: a candle that was still open when first stored (today's daily
bar, the current 5-minute bar) gets its final values on the next ingest.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FetchLog, PriceBar
from app.services.market import AssetClass, Bar, ExternalAPIError
from app.services.upsert import upsert

logger = logging.getLogger(__name__)

FetchBars = Callable[[str, str], list[Bar]]

_FIELDS = ("open", "high", "low", "close", "volume")


def normalize_symbol(symbol: str) -> str:
    """Clean up user input: ' btc ' -> 'BTC'."""
    return symbol.strip().upper()


def _utc(ts: datetime) -> datetime:
    """Make a timestamp timezone-aware UTC (SQLite in tests returns naive datetimes)."""
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)  # SQLite drops tzinfo


def is_stale(
    session: Session, asset_class: AssetClass, symbol: str, interval: str, ttl_minutes: int
) -> bool:
    """Return True if this series was never fetched or was fetched longer ago than ttl_minutes."""
    log = session.get(FetchLog, (asset_class, symbol, interval))
    if log is None:
        return True
    return datetime.now(UTC) - _utc(log.last_fetched_at) > timedelta(minutes=ttl_minutes)


def ingest(
    session: Session, fetch: FetchBars, asset_class: AssetClass, symbol: str, interval: str
) -> int:
    """Fetch from the external API and upsert bars. Returns how many were new."""
    bars = fetch(symbol, interval)

    existing = set(
        session.scalars(
            select(PriceBar.ts).where(
                PriceBar.asset_class == asset_class,
                PriceBar.symbol == symbol,
                PriceBar.interval == interval,
            )
        )
    )
    existing = {_utc(ts) for ts in existing}
    new = sum(1 for b in bars if b.ts not in existing)

    # One atomic upsert: new candles are inserted, candles that were still
    # open last time get their final values, and concurrent requests for the
    # same symbol can't collide on the unique constraint.
    upsert(
        session,
        PriceBar,
        [
            {
                "asset_class": asset_class,
                "symbol": symbol,
                "interval": interval,
                "ts": b.ts,
                **{f: getattr(b, f) for f in _FIELDS},
            }
            for b in bars
        ],
        key_columns=("asset_class", "symbol", "interval", "ts"),
        update_columns=_FIELDS,
    )
    upsert(
        session,
        FetchLog,
        [
            {
                "asset_class": asset_class,
                "symbol": symbol,
                "interval": interval,
                "last_fetched_at": datetime.now(UTC),
            }
        ],
        key_columns=("asset_class", "symbol", "interval"),
        update_columns=("last_fetched_at",),
    )
    session.commit()
    logger.info(
        "Ingested %s %s %s: %d new of %d bars", asset_class, symbol, interval, new, len(bars)
    )
    return new


@dataclass(frozen=True)
class BarsResult:
    """Candles for one series, plus whether they could not be refreshed (stale=True)."""

    bars: list[PriceBar]
    stale: bool = False


def _stored_bars(
    session: Session, asset_class: AssetClass, symbol: str, interval: str, limit: int
) -> list[PriceBar]:
    """The latest `limit` stored candles for a series, oldest first."""
    rows = session.scalars(
        select(PriceBar)
        .where(
            PriceBar.asset_class == asset_class,
            PriceBar.symbol == symbol,
            PriceBar.interval == interval,
        )
        .order_by(PriceBar.ts.desc())
        .limit(limit)
        # Upserts bypass the ORM, so refresh any candles this session already holds.
        .execution_options(populate_existing=True)
    ).all()
    return list(reversed(rows))


def get_bars(
    session: Session,
    fetch: FetchBars,
    asset_class: AssetClass,
    symbol: str,
    interval: str,
    ttl_minutes: int,
    limit: int,
) -> BarsResult:
    """Return the latest `limit` candles from the database, oldest first.

    If the stored data is stale, fetch fresh data from the external API first.
    This is what keeps us inside the free API quotas.

    If that refresh fails (quota used up, provider down) but older candles are
    stored, those are returned with stale=True instead of failing the request.
    """
    stale = False
    if is_stale(session, asset_class, symbol, interval, ttl_minutes):
        try:
            ingest(session, fetch, asset_class, symbol, interval)
        except ExternalAPIError as exc:
            session.rollback()
            stored = _stored_bars(session, asset_class, symbol, interval, limit)
            if not stored:
                raise
            logger.warning(
                "Refreshing %s %s %s failed (%s); serving stored candles",
                asset_class,
                symbol,
                interval,
                exc,
            )
            return BarsResult(stored, stale=True)

    return BarsResult(_stored_bars(session, asset_class, symbol, interval, limit), stale)
