"""Shared pytest fixtures: in-memory SQLite database, fake data fetchers and a test client.

Tests never call real external APIs or a real database.
"""

import os

# Tests never touch real services. Environment variables win over a local .env,
# so a developer's real settings (keys, ingest token) never leak into tests.
os.environ.update(
    {
        "DATABASE_URL": "sqlite://",
        "ALPHAVANTAGE_API_KEY": "test-key",
        "INGEST_TOKEN": "",
        "CACHE_TTL_MINUTES": "60",
        "CRYPTO_CACHE_TTL_MINUTES": "5",
        "CORS_ORIGINS": "",
    }
)

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401
from app.db import Base, get_session
from app.main import app
from app.routers.crypto import get_crypto_fetcher
from app.routers.stocks import get_fetcher

# Binance /api/v3/klines rows: [open time ms, open, high, low, close, volume, close time, ...]
SAMPLE_KLINES = [
    [
        1761595200000,
        "98000.10",
        "98500.00",
        "97800.00",
        "98200.50",
        "12.34567",
        1761595499999,
        "1211111.1",
        1500,
        "6.1",
        "600000.0",
        "0",
    ],
    [
        1761595500000,
        "98200.50",
        "98700.00",
        "98100.00",
        "98650.00",
        "8.5",
        1761595799999,
        "838000.0",
        1200,
        "4.0",
        "400000.0",
        "0",
    ],
]

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
    """A fresh, empty in-memory database for each test."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as s:
        yield s


class FakeFetcher:
    """Stand-in for a real API client: returns fixed bars (or raises `exc`) and counts calls."""

    def __init__(self, bars=None, exc: Exception | None = None):
        """Use the given bars, or default to the parsed sample Alpha Vantage response."""
        from app.services.alphavantage import AlphaVantageClient

        self.calls = 0
        self.exc = exc
        self.bars = (
            bars if bars is not None else AlphaVantageClient._parse("IBM", "5min", SAMPLE_INTRADAY)
        )

    def __call__(self, symbol: str, interval: str):
        """Pretend to fetch: record the call, then return the bars or raise the configured error."""
        self.calls += 1
        self.last_symbol = symbol
        if self.exc:
            raise self.exc
        return self.bars


@pytest.fixture
def fake_fetcher() -> FakeFetcher:
    """Fake stock data source (Alpha Vantage sample data)."""
    return FakeFetcher()


@pytest.fixture
def fake_crypto_fetcher() -> FakeFetcher:
    """Fake crypto data source (Binance sample klines)."""
    from app.services.binance import BinanceClient

    return FakeFetcher(bars=BinanceClient._parse(SAMPLE_KLINES))


@pytest.fixture
def client(
    session: Session, fake_fetcher: FakeFetcher, fake_crypto_fetcher: FakeFetcher
) -> Iterator[TestClient]:
    """HTTP test client wired to the test database and the fake fetchers."""
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_fetcher] = lambda: fake_fetcher
    app.dependency_overrides[get_crypto_fetcher] = lambda: fake_crypto_fetcher
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
