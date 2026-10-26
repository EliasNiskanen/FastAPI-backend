"""Database-first price lookups.

Reads come from our own PostgreSQL. The external API is called only when the
stored data for a (symbol, interval) is older than CACHE_TTL_MINUTES, or when
an ingest is forced. That keeps us inside the free API quota.
"""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FetchLog, PriceBar
from app.services.alphavantage import Bar

logger = logging.getLogger(__name__)

FetchBars = Callable[[str, str], list[Bar]]


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def is_stale(session: Session, symbol: str, interval: str, ttl_minutes: int) -> bool:
    log = session.get(FetchLog, (symbol, interval))
    if log is None:
        return True
    last = log.last_fetched_at
    if last.tzinfo is None:  # SQLite drops tzinfo
        last = last.replace(tzinfo=UTC)
    return datetime.now(UTC) - last > timedelta(minutes=ttl_minutes)


def ingest(session: Session, fetch: FetchBars, symbol: str, interval: str) -> int:
    """Fetch from the external API and store new bars. Returns how many were new."""
    bars = fetch(symbol, interval)

    existing = set(
        session.scalars(
            select(PriceBar.ts).where(PriceBar.symbol == symbol, PriceBar.interval == interval)
        )
    )
    existing = {t if t.tzinfo else t.replace(tzinfo=UTC) for t in existing}

    new = [b for b in bars if b.ts not in existing]
    session.add_all(
        PriceBar(
            symbol=symbol,
            interval=interval,
            ts=b.ts,
            open=b.open,
            high=b.high,
            low=b.low,
            close=b.close,
            volume=b.volume,
        )
        for b in new
    )
    session.merge(FetchLog(symbol=symbol, interval=interval, last_fetched_at=datetime.now(UTC)))
    session.commit()
    logger.info("Ingested %s %s: %d new of %d bars", symbol, interval, len(new), len(bars))
    return len(new)


def get_bars(
    session: Session,
    fetch: FetchBars,
    symbol: str,
    interval: str,
    ttl_minutes: int,
    limit: int,
) -> list[PriceBar]:
    if is_stale(session, symbol, interval, ttl_minutes):
        ingest(session, fetch, symbol, interval)

    rows = session.scalars(
        select(PriceBar)
        .where(PriceBar.symbol == symbol, PriceBar.interval == interval)
        .order_by(PriceBar.ts.desc())
        .limit(limit)
    ).all()
    return list(reversed(rows))
