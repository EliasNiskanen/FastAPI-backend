import os

# Tests never touch real services.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ALPHAVANTAGE_API_KEY", "test-key")

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db import Base, get_session
from app.main import app
from app.routers.stocks import get_fetcher

SAMPLE_INTRADAY = {
    "Meta Data": {"1. Information": "Intraday", "6. Time Zone": "US/Eastern"},
    "Time Series (5min)": {
        "2026-10-23 16:00:00": {
            "1. open": "101.0",
            "2. high": "102.0",
            "3. low": "100.5",
            "4. close": "101.5",
            "5. volume": "1200",
        },
        "2026-10-23 15:55:00": {
            "1. open": "100.0",
            "2. high": "101.2",
            "3. low": "99.8",
            "4. close": "101.0",
            "5. volume": "900",
        },
    },
}


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as s:
        yield s


class FakeFetcher:
    def __init__(self, bars=None, exc: Exception | None = None):
        from app.services.alphavantage import AlphaVantageClient

        self.calls = 0
        self.exc = exc
        self.bars = (
            bars if bars is not None else AlphaVantageClient._parse("IBM", "5min", SAMPLE_INTRADAY)
        )

    def __call__(self, symbol: str, interval: str):
        self.calls += 1
        if self.exc:
            raise self.exc
        return self.bars


@pytest.fixture
def fake_fetcher() -> FakeFetcher:
    return FakeFetcher()


@pytest.fixture
def client(session: Session, fake_fetcher: FakeFetcher) -> Iterator[TestClient]:
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_fetcher] = lambda: fake_fetcher
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
