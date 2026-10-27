"""Database-backed cache for JSON data from external APIs.

Same idea as the price cache in prices.py, for data that is not candles:
answer from the `api_cache` table while the entry is fresh, call the external
API when it is stale, and fall back to the old entry if the API fails. That
last part means a rate-limited provider degrades to "slightly old data"
instead of an error page.

A small in-process memo sits in front of the table, so a burst of requests
(for example search-as-you-type) does not reload a large JSON document from
the database on every keystroke.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import ApiCache
from app.services.market import ExternalAPIError
from app.services.upsert import upsert

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Cached:
    """A cache hit: the payload, when it was fetched, and whether it is past its TTL."""

    payload: Any
    fetched_at: datetime
    stale: bool = False


# key -> (payload, fetched_at). Per process; each Cloud Run instance has its own.
_memo: dict[str, tuple[Any, datetime]] = {}


def clear_memo() -> None:
    """Forget the in-process memo (used by tests)."""
    _memo.clear()


def _utc(ts: datetime) -> datetime:
    """Make a timestamp timezone-aware UTC (SQLite in tests returns naive datetimes)."""
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


def _is_fresh(fetched_at: datetime, ttl_minutes: int) -> bool:
    """True if data fetched at `fetched_at` is younger than the TTL."""
    return datetime.now(UTC) - _utc(fetched_at) <= timedelta(minutes=ttl_minutes)


def get_cached(session: Session, key: str, ttl_minutes: int, loader: Callable[[], Any]) -> Cached:
    """Return the cached payload for `key`, calling `loader()` to refresh it when stale.

    `loader` must return JSON-serializable data. If it raises an
    ExternalAPIError and an older entry exists, the old entry is returned with
    stale=True; without an older entry the error propagates.
    """
    memo = _memo.get(key)
    if memo and _is_fresh(memo[1], ttl_minutes):
        return Cached(memo[0], memo[1])

    row = session.get(ApiCache, key)
    if row is not None and _is_fresh(row.fetched_at, ttl_minutes):
        _memo[key] = (row.payload, _utc(row.fetched_at))
        return Cached(row.payload, _utc(row.fetched_at))

    try:
        payload = loader()
    except ExternalAPIError as exc:
        if row is None:
            raise
        logger.warning("Refreshing %s failed (%s); serving cached data", key, exc)
        return Cached(row.payload, _utc(row.fetched_at), stale=True)

    now = datetime.now(UTC)
    upsert(
        session,
        ApiCache,
        [{"key": key, "payload": payload, "fetched_at": now}],
        key_columns=("key",),
        update_columns=("payload", "fetched_at"),
    )
    session.commit()
    _memo[key] = (payload, now)
    return Cached(payload, now)


def peek(session: Session, key: str) -> Any | None:
    """Return whatever is cached for `key` (fresh or not) without calling any API."""
    memo = _memo.get(key)
    if memo:
        return memo[0]
    row = session.get(ApiCache, key)
    return row.payload if row is not None else None
