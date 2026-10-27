"""Concurrent ingests of the same symbol against real PostgreSQL.

Runs only when TEST_POSTGRES_URL is set (CI provides a PostgreSQL service).
Regression test: parallel first requests for a new symbol used to collide on
the unique constraint and fail with HTTP 503.
"""

import os
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import FetchLog, PriceBar
from app.services import prices
from app.services.alphavantage import AlphaVantageClient
from tests.conftest import SAMPLE_INTRADAY

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


def test_parallel_ingests_do_not_collide():
    """Eight threads ingest the same new series at once; all succeed, no duplicates."""
    engine = create_engine(URL)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM price_bars WHERE symbol = 'RACE'"))
        conn.execute(text("DELETE FROM fetch_log WHERE symbol = 'RACE'"))
    make_session = sessionmaker(bind=engine, expire_on_commit=False)
    bars = AlphaVantageClient._parse("RACE", "5min", SAMPLE_INTRADAY)

    def run(_: int) -> int:
        """One request: its own session, ingesting the same series."""
        with make_session() as session:
            return prices.ingest(session, lambda s, i: bars, "stock", "RACE", "5min")

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(run, range(8)))  # raises if any thread failed

    with make_session() as session:
        count = session.scalar(
            select(func.count()).select_from(PriceBar).where(PriceBar.symbol == "RACE")
        )
        logs = session.scalar(
            select(func.count()).select_from(FetchLog).where(FetchLog.symbol == "RACE")
        )
    assert count == len(bars)
    assert logs == 1
