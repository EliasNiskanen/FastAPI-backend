"""Thin client for the Alpha Vantage API.

It only fetches and parses. Deciding *when* to call it (caching) lives in
app/services/prices.py.
"""

import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

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


class AlphaVantageClient:
    """Fetches stock candles from Alpha Vantage. Needs ALPHAVANTAGE_API_KEY."""

    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        """Create the client. `http` can be replaced in tests with a fake transport."""
        if not settings.alphavantage_api_key:
            raise ExternalAPIError("ALPHAVANTAGE_API_KEY is not configured")
        self._settings = settings
        self._http = http or httpx.Client(timeout=settings.http_timeout_seconds)

    def fetch_bars(self, symbol: str, interval: str) -> list[Bar]:
        """Download the latest candles for a stock symbol and return them oldest first."""
        if interval not in SUPPORTED_INTERVALS:
            raise ValueError(f"Unsupported interval: {interval}")

        params = {"symbol": symbol, "apikey": self._settings.alphavantage_api_key}
        if interval == "daily":
            params["function"] = "TIME_SERIES_DAILY"
        else:
            params["function"] = "TIME_SERIES_INTRADAY"
            params["interval"] = interval

        try:
            response = self._http.get(self._settings.alphavantage_base_url, params=params)
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Never log params: they contain the API key.
            logger.error("Alpha Vantage request failed for %s: %s", symbol, type(exc).__name__)
            raise ExternalAPIError("Market data provider is unreachable") from exc

        return self._parse(symbol, interval, data)

    @staticmethod
    def _parse(symbol: str, interval: str, data: dict) -> list[Bar]:
        """Turn an Alpha Vantage JSON response into Bars, or raise the matching error.

        Alpha Vantage reports errors with HTTP 200 and a special key in the body,
        so errors are detected from the JSON content.
        """
        if "Error Message" in data:
            raise SymbolNotFoundError(f"Unknown symbol: {symbol}")
        # Alpha Vantage answers HTTP 200 with a "Note"/"Information" text when
        # the free quota is used up.
        if "Note" in data or "Information" in data:
            logger.warning(
                "Alpha Vantage limit message: %s", data.get("Note") or data.get("Information")
            )
            raise RateLimitedError("Market data provider rate limit reached")

        series_key = "Time Series (Daily)" if interval == "daily" else f"Time Series ({interval})"
        series = data.get(series_key)
        meta = data.get("Meta Data", {})
        if not isinstance(series, dict):
            raise ExternalAPIError("Unexpected response format from market data provider")

        tz_name = next((v for k, v in meta.items() if k.endswith("Time Zone")), "US/Eastern")
        tz = ZoneInfo(tz_name)

        bars = []
        for raw_ts, values in series.items():
            if interval == "daily":
                d = date.fromisoformat(raw_ts)
                ts = datetime(d.year, d.month, d.day, tzinfo=UTC)
            else:
                ts = datetime.fromisoformat(raw_ts).replace(tzinfo=tz).astimezone(UTC)
            bars.append(
                Bar(
                    ts=ts,
                    open=Decimal(values["1. open"]),
                    high=Decimal(values["2. high"]),
                    low=Decimal(values["3. low"]),
                    close=Decimal(values["4. close"]),
                    volume=Decimal(values["5. volume"]),
                )
            )
        bars.sort(key=lambda b: b.ts)
        return bars
