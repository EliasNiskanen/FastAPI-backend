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
        "STOCK_MOVERS_TTL_MINUTES": "360",
        "CRYPTO_MOVERS_MIN_VOLUME": "10000000",
        "DEFAULT_CRYPTO_QUOTE": "USDT",
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
from app.routers.market import get_market_sources
from app.routers.stocks import get_fetcher
from app.services import cache
from app.services.markets import MarketSources

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


def ticker(symbol: str, price: float, pct: float, quote_volume: float) -> dict:
    """A Binance /api/v3/ticker/24hr row with the fields the app reads."""
    return {
        "symbol": symbol,
        "lastPrice": str(price),
        "priceChange": str(round(price * pct / 100, 8)),
        "priceChangePercent": str(pct),
        "highPrice": str(price * 1.05),
        "lowPrice": str(price * 0.95),
        "quoteVolume": str(quote_volume),
    }


SAMPLE_TICKERS = [
    ticker("BTCUSDT", 98000, 2.5, 2_000_000_000),
    ticker("ETHUSDT", 3500, -1.2, 900_000_000),
    ticker("SOLUSDT", 180, 8.4, 400_000_000),
    ticker("DOGEUSDT", 0.2, -6.3, 150_000_000),
    ticker("TINYUSDT", 0.01, 45.0, 50_000),  # illiquid: excluded from movers
    ticker("USDCUSDT", 1.0, 0.01, 3_000_000_000),  # stablecoin: always excluded
    ticker("BTCEUR", 90000, 2.4, 80_000_000),  # other quote: excluded
    ticker("MUBUSDT", 110, 12.0, 30_000_000),  # tokenized Micron stock (MU + "B")
    ticker("BNBUSDT", 610, 0.5, 70_000_000),  # a real coin, although BN is a stock ticker
]

SAMPLE_STOCK_MOVERS = {
    "last_updated": "2026-10-26 16:15:59 US/Eastern",
    "gainers": [
        {"symbol": "ABCDW", "price": 0.3, "change": 0.2, "change_percent": 200.0, "volume": 5e6},
        {"symbol": "NVDA", "price": 140.0, "change": 9.1, "change_percent": 6.95, "volume": 3e8},
        {"symbol": "TINY", "price": 12.0, "change": 2.0, "change_percent": 20.0, "volume": 900},
    ],
    "losers": [
        {"symbol": "INTC", "price": 21.0, "change": -2.4, "change_percent": -10.26, "volume": 9e7},
    ],
}

SAMPLE_LISTING = [
    ["AAPL", "Apple Inc", "NASDAQ", "Stock"],
    ["APLE", "Apple Hospitality REIT Inc", "NYSE", "Stock"],
    ["MU", "Micron Technology Inc", "NASDAQ", "Stock"],
    ["BN", "Brookfield Corp", "NYSE", "Stock"],
    ["MSFT", "Microsoft Corporation", "NASDAQ", "Stock"],
    ["NVDA", "NVIDIA Corporation", "NASDAQ", "Stock"],
    ["SPY", "SPDR S&P 500 ETF Trust", "NYSE ARCA", "ETF"],
]


class FakeSources:
    """Fake external APIs for the market endpoints; counts calls, can be set to fail."""

    def __init__(self):
        """Start with the sample data and no failures."""
        self.calls = {"crypto": 0, "movers": 0, "listing": 0}
        self.fail: dict[str, Exception] = {}

    def _call(self, name: str, value):
        """Record a call, then return `value` or raise the configured error."""
        self.calls[name] += 1
        if name in self.fail:
            raise self.fail[name]
        return value

    def sources(self) -> MarketSources:
        """The MarketSources object the router dependency returns."""
        return MarketSources(
            crypto_tickers=lambda: self._call("crypto", SAMPLE_TICKERS),
            stock_movers=lambda: self._call("movers", SAMPLE_STOCK_MOVERS),
            stock_listing=lambda: self._call("listing", SAMPLE_LISTING),
        )


@pytest.fixture
def fake_sources() -> FakeSources:
    """Fake market-wide data sources (Binance 24h tickers, Alpha Vantage movers and listing)."""
    return FakeSources()


@pytest.fixture(autouse=True)
def _clear_cache_memo():
    """The api_cache memo is per process; reset it so tests don't leak into each other."""
    cache.clear_memo()
    yield
    cache.clear_memo()


@pytest.fixture
def client(
    session: Session,
    fake_fetcher: FakeFetcher,
    fake_crypto_fetcher: FakeFetcher,
    fake_sources: FakeSources,
) -> Iterator[TestClient]:
    """HTTP test client wired to the test database and the fake fetchers."""
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_fetcher] = lambda: fake_fetcher
    app.dependency_overrides[get_crypto_fetcher] = lambda: fake_crypto_fetcher
    app.dependency_overrides[get_market_sources] = fake_sources.sources
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
