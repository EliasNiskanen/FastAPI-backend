"""Client for Binance's public market data API (no API key, free).

Uses the market-data-only host data-api.binance.vision and the
GET /api/v3/klines endpoint. Note: Binance blocks some countries (including
the US), so run this backend in an EU region.
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from app.config import Settings
from app.services.market import (
    SUPPORTED_INTERVALS,
    Bar,
    ExternalAPIError,
    RateLimitedError,
    SymbolNotFoundError,
)

logger = logging.getLogger(__name__)

# Our interval names -> Binance kline intervals
BINANCE_INTERVALS = {
    "1min": "1m",
    "5min": "5m",
    "15min": "15m",
    "30min": "30m",
    "60min": "1h",
    "daily": "1d",
}
assert set(BINANCE_INTERVALS) == set(SUPPORTED_INTERVALS)

INVALID_SYMBOL_CODE = -1121
MAX_KLINES = 1000  # Binance maximum per request


class BinanceClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self._settings = settings
        self._http = http or httpx.Client(timeout=settings.http_timeout_seconds)

    def fetch_bars(self, symbol: str, interval: str) -> list[Bar]:
        """symbol is a Binance pair such as BTCUSDT or ETHEUR."""
        if interval not in BINANCE_INTERVALS:
            raise ValueError(f"Unsupported interval: {interval}")

        params = {"symbol": symbol, "interval": BINANCE_INTERVALS[interval], "limit": MAX_KLINES}
        url = f"{self._settings.binance_base_url}/api/v3/klines"
        try:
            response = self._http.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.error("Binance request failed for %s: %s", symbol, type(exc).__name__)
            raise ExternalAPIError("Crypto data provider is unreachable") from exc

        # 429 = too many requests, 418 = IP temporarily banned for ignoring 429s
        if response.status_code in (418, 429):
            logger.warning("Binance rate limit hit (%s)", response.status_code)
            raise RateLimitedError("Crypto data provider rate limit reached")

        try:
            data = response.json()
        except ValueError as exc:
            raise ExternalAPIError("Unexpected response from crypto data provider") from exc

        if response.status_code != 200:
            code = data.get("code") if isinstance(data, dict) else None
            if code == INVALID_SYMBOL_CODE:
                raise SymbolNotFoundError(f"Unknown trading pair: {symbol}")
            logger.error("Binance error %s for %s: %s", response.status_code, symbol, data)
            raise ExternalAPIError("Crypto data provider returned an error")

        return self._parse(data)

    @staticmethod
    def _parse(data: object) -> list[Bar]:
        if not isinstance(data, list):
            raise ExternalAPIError("Unexpected response format from crypto data provider")
        try:
            bars = [
                Bar(
                    ts=datetime.fromtimestamp(row[0] / 1000, tz=UTC),
                    open=Decimal(row[1]),
                    high=Decimal(row[2]),
                    low=Decimal(row[3]),
                    close=Decimal(row[4]),
                    volume=Decimal(row[5]),
                )
                for row in data
            ]
        except (IndexError, TypeError, ArithmeticError) as exc:
            raise ExternalAPIError("Unexpected kline format from crypto data provider") from exc
        bars.sort(key=lambda b: b.ts)
        return bars
