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
    """One OHLCV candle: open, high, low, close and traded volume for one time period."""

    ts: datetime  # candle open time, UTC
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal  # crypto volumes are fractional (e.g. 0.53 BTC)


class ExternalAPIError(Exception):
    """Base error for problems talking to an external market data API."""


class SymbolNotFoundError(ExternalAPIError):
    """The provider does not know the requested symbol (mapped to HTTP 404)."""


class RateLimitedError(ExternalAPIError):
    """The provider's request quota is used up (mapped to HTTP 503 + Retry-After).

    burst=True means a short per-second limit was hit (worth one quick retry),
    as opposed to a daily quota that won't reset for hours.
    """

    def __init__(self, message: str, *, burst: bool = False):
        """Store whether the limit is a short burst limit."""
        super().__init__(message)
        self.burst = burst
