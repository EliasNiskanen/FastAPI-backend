"""Types shared by all market data providers (Alpha Vantage, Binance, ...)."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal, get_args

# The interval names our API uses. Each provider maps them to its own codes.
Interval = Literal["1min", "5min", "15min", "30min", "60min", "daily"]
SUPPORTED_INTERVALS: tuple[str, ...] = get_args(Interval)

AssetClass = Literal["stock", "crypto"]


@dataclass(frozen=True)
class Bar:
    ts: datetime  # candle open time, UTC
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal  # crypto volumes are fractional (e.g. 0.53 BTC)


class ExternalAPIError(Exception):
    """Base error for problems talking to an external market data API."""


class SymbolNotFoundError(ExternalAPIError):
    pass


class RateLimitedError(ExternalAPIError):
    pass
