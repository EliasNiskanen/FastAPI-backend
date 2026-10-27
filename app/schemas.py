"""Pydantic models that define the JSON shape of API responses."""

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.market import AssetClass


class PriceBarOut(BaseModel):
    """One candle in an API response."""

    model_config = ConfigDict(from_attributes=True)

    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @field_validator("ts")
    @classmethod
    def _to_utc(cls, v: datetime) -> datetime:
        """Always answer in UTC, whatever timezone the database session uses."""
        return v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)


class PriceSeriesOut(BaseModel):
    """Response of GET /api/stocks/{symbol} and GET /api/crypto/{base}: candles oldest first."""

    asset_class: AssetClass
    symbol: str
    interval: str = Field(
        description="Interval of the returned candles. Differs from the requested one when "
        "that could not be fetched and the closest stored interval is served instead."
    )
    stale: bool = Field(
        default=False,
        description="True if the provider could not be reached and stored candles are returned.",
    )
    bars: list[PriceBarOut]


class IngestResult(BaseModel):
    """Response of the ingest endpoints: how many new candles were stored."""

    asset_class: AssetClass
    symbol: str
    interval: str
    new_bars: int


class MarketItem(BaseModel):
    """A stock or coin with its latest price and daily change (24h for crypto)."""

    asset_class: AssetClass
    symbol: str = Field(description="Ticker, e.g. AAPL or BTC")
    name: str | None = None
    quote: str | None = Field(default=None, description="Quote currency for crypto, e.g. USDT")
    price: float
    change: float
    change_percent: float
    volume: float = Field(description="Shares for stocks, 24h turnover in the quote currency")
    high: float | None = None
    low: float | None = None


class MoversOut(BaseModel):
    """Response of GET /api/market/movers: today's biggest gainers and losers."""

    asset_class: AssetClass
    as_of: datetime = Field(description="When the data was fetched from the provider (UTC)")
    stale: bool = False
    gainers: list[MarketItem]
    losers: list[MarketItem]


class CryptoOverviewOut(BaseModel):
    """Response of GET /api/market/crypto: 24h stats for a list of coins."""

    as_of: datetime
    stale: bool = False
    items: list[MarketItem]


class SearchResult(BaseModel):
    """One search hit; asset_class and symbol identify what to load next."""

    asset_class: AssetClass
    symbol: str
    name: str
    exchange: str | None = None
    quote: str | None = None


class SearchOut(BaseModel):
    """Response of GET /api/search."""

    query: str
    partial: bool = Field(
        default=False,
        description="True if a data source was unavailable, so results may be incomplete",
    )
    results: list[SearchResult]
