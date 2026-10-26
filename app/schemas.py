"""Pydantic models that define the JSON shape of API responses."""

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator

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
    interval: str
    bars: list[PriceBarOut]


class IngestResult(BaseModel):
    """Response of the ingest endpoints: how many new candles were stored."""

    asset_class: AssetClass
    symbol: str
    interval: str
    new_bars: int
