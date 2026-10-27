"""Thin client for the Alpha Vantage API.

It only fetches and parses. Deciding *when* to call it (caching) lives in
app/services/prices.py.
"""

import csv
import io
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TypeVar
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

T = TypeVar("T")


def _raise_for_limit(data: dict) -> None:
    """Raise RateLimitedError if Alpha Vantage answered with a quota message.

    Alpha Vantage answers HTTP 200 with a "Note" or "Information" text when the
    free quota is used up (or the endpoint needs a premium key).
    """
    if "Note" in data or "Information" in data:
        message = str(data.get("Note") or data.get("Information"))
        logger.warning("Alpha Vantage limit message: %s", message)
        # The free key also allows only about one request per second; that
        # message mentions "second" and clears almost immediately.
        raise RateLimitedError(
            "Market data provider rate limit reached", burst="second" in message.lower()
        )


def _number(value: object) -> float:
    """Parse Alpha Vantage numbers, which arrive as strings such as "12.5" or "3.1%"."""
    return float(str(value).strip().rstrip("%"))


class AlphaVantageClient:
    """Fetches stock candles from Alpha Vantage. Needs ALPHAVANTAGE_API_KEY."""

    # Seconds to wait before retrying after a per-second limit (tests set 0).
    burst_wait_seconds = 1.2

    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        """Create the client. `http` can be replaced in tests with a fake transport."""
        if not settings.alphavantage_api_key:
            raise ExternalAPIError("ALPHAVANTAGE_API_KEY is not configured")
        self._settings = settings
        self._http = http or httpx.Client(timeout=settings.http_timeout_seconds)

    def _fetch_bars(self, symbol: str, interval: str) -> list[Bar]:
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
        _raise_for_limit(data)

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

    def _get(self, params: dict[str, str], what: str) -> httpx.Response:
        """GET an Alpha Vantage function with the API key added; network errors -> ExternalAPIError."""
        try:
            response = self._http.get(
                self._settings.alphavantage_base_url,
                params={**params, "apikey": self._settings.alphavantage_api_key},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Never log params: they contain the API key.
            logger.error("Alpha Vantage %s request failed: %s", what, type(exc).__name__)
            raise ExternalAPIError("Market data provider is unreachable") from exc
        return response

    def _fetch_top_movers(self) -> dict:
        """Today's biggest US stock gainers and losers (function TOP_GAINERS_LOSERS).

        Returns {"last_updated": str | None, "gainers": [...], "losers": [...]},
        each item {"symbol", "price", "change", "change_percent", "volume"}.
        """
        response = self._get({"function": "TOP_GAINERS_LOSERS"}, "top movers")
        try:
            data = response.json()
        except ValueError as exc:
            raise ExternalAPIError("Unexpected response from market data provider") from exc
        return self._parse_movers(data)

    @staticmethod
    def _parse_movers(data: dict) -> dict:
        """Normalize a TOP_GAINERS_LOSERS response; rows that fail to parse are skipped."""
        _raise_for_limit(data)
        if "top_gainers" not in data or "top_losers" not in data:
            raise ExternalAPIError("Unexpected response format from market data provider")

        def rows(items: list) -> list[dict]:
            """Convert provider rows to our field names."""
            out = []
            for item in items:
                try:
                    out.append(
                        {
                            "symbol": str(item["ticker"]).upper(),
                            "price": _number(item["price"]),
                            "change": _number(item["change_amount"]),
                            "change_percent": _number(item["change_percentage"]),
                            "volume": _number(item["volume"]),
                        }
                    )
                except (KeyError, ValueError):
                    continue
            return out

        return {
            "last_updated": data.get("last_updated"),
            "gainers": rows(data["top_gainers"]),
            "losers": rows(data["top_losers"]),
        }

    def _fetch_listing(self) -> list[list[str]]:
        """All actively listed US stocks and ETFs (function LISTING_STATUS, a CSV file).

        Returns compact rows [symbol, name, exchange, asset_type] for search.
        """
        response = self._get({"function": "LISTING_STATUS"}, "listing")
        return self._parse_listing(response.text)

    @staticmethod
    def _parse_listing(text: str) -> list[list[str]]:
        """Parse the LISTING_STATUS CSV. A JSON body instead of CSV means an error message."""
        stripped = text.lstrip()
        if stripped.startswith("{"):
            try:
                data = json.loads(stripped)
            except ValueError as exc:
                raise ExternalAPIError("Unexpected response from market data provider") from exc
            _raise_for_limit(data)
            raise ExternalAPIError("Unexpected response from market data provider")

        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or "symbol" not in reader.fieldnames:
            raise ExternalAPIError("Unexpected listing format from market data provider")
        return [
            [
                row["symbol"],
                row.get("name") or "",
                row.get("exchange") or "",
                row.get("assetType") or "",
            ]
            for row in reader
            if row.get("symbol") and (row.get("status") or "Active") == "Active"
        ]

    def _with_burst_retry(self, call: Callable[[], T]) -> T:
        """Run `call`; if it hits the per-second limit, wait a moment and try once more."""
        try:
            return call()
        except RateLimitedError as exc:
            if not exc.burst:
                raise
            time.sleep(self.burst_wait_seconds)
            return call()

    def fetch_bars(self, symbol: str, interval: str) -> list[Bar]:
        """Download the latest candles for a stock symbol and return them oldest first."""
        return self._with_burst_retry(lambda: self._fetch_bars(symbol, interval))

    def fetch_top_movers(self) -> dict:
        """Today's biggest US stock gainers and losers (see _fetch_top_movers)."""
        return self._with_burst_retry(self._fetch_top_movers)

    def fetch_listing(self) -> list[list[str]]:
        """All actively listed US stocks and ETFs (see _fetch_listing)."""
        return self._with_burst_retry(self._fetch_listing)
