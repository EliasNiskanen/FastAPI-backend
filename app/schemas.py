from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class PriceBarOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int

    @field_validator("ts")
    @classmethod
    def _to_utc(cls, v: datetime) -> datetime:
        # Always answer in UTC, whatever the database session timezone is.
        return v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)


class PriceSeriesOut(BaseModel):
    symbol: str
    interval: str
    bars: list[PriceBarOut]


class IngestResult(BaseModel):
    symbol: str
    interval: str
    new_bars: int
