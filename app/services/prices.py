"""Database-first price lookups for stocks and crypto.

Reads come from our own PostgreSQL. The external API is called only when the
stored data for an (asset class, symbol, interval) is older than the TTL, or
when an ingest is forced.

Ingest upserts: a candle that was still open when first stored (today's daily
bar, the current 5-minute bar) gets its final values on the next ingest.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FetchLog, PriceBar
from app.services.market import AssetClass, Bar

logger = logging.getLogger(__name__)

FetchBars = Callable[[str, str], list[Bar]]

_FIELDS = ("open", "high", "low", "close", "volume")


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)  # SQLite drops tzinfo


def is_stale(
    session: Session, asset_class: AssetClass, symbol: str, interval: str, ttl_minutes: int
) -> bool:
    log = session.get(FetchLog, (asset_class, symbol, interval))
    if log is None:
        return True
    return datetime.now(UTC) - _utc(log.last_fetched_at) > timedelta(minutes=ttl_minutes)


def ingest(
    session: Session, fetch: FetchBars, asset_class: AssetClass, symbol: str, interval: str
) -> int:
    """Fetch from the external API and upsert bars. Returns how many were new."""
    bars = fetch(symbol, interval)

    existing = {
        _utc(row.ts): row
        for row in session.scalars(
            select(PriceBar).where(
                PriceBar.asset_class == asset_class,
                PriceBar.symbol == symbol,
                PriceBar.interval == interval,
            )
        )
    }

    new = 0
    for b in bars:
        row = existing.get(b.ts)
        if row is None:
            session.add(
                PriceBar(
                    asset_class=asset_class,
                    symbol=symbol,
                    interval=interval,
                    ts=b.ts,
                    **{f: getattr(b, f) for f in _FIELDS},
                )
            )
            new += 1
        else:
            for f in _FIELDS:
                if getattr(row, f) != getattr(b, f):
                    setattr(row, f, getattr(b, f))

    session.merge(
        FetchLog(
            asset_class=asset_class,
            symbol=symbol,
            interval=interval,
            last_fetched_at=datetime.now(UTC),
        )
    )
    session.commit()
    logger.info(
        "Ingested %s %s %s: %d new of %d bars", asset_class, symbol, interval, new, len(bars)
    )
    return new


def get_bars(
    session: Session,
    fetch: FetchBars,
    asset_class: AssetClass,
    symbol: str,
    interval: str,
    ttl_minutes: int,
    limit: int,
) -> list[PriceBar]:
    if is_stale(session, asset_class, symbol, interval, ttl_minutes):
        ingest(session, fetch, asset_class, symbol, interval)

    rows = session.scalars(
        select(PriceBar)
        .where(
            PriceBar.asset_class == asset_class,
            PriceBar.symbol == symbol,
            PriceBar.interval == interval,
        )
        .order_by(PriceBar.ts.desc())
        .limit(limit)
    ).all()
    return list(reversed(rows))
