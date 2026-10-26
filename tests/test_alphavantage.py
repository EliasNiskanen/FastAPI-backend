from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.config import Settings
from app.services.alphavantage import AlphaVantageClient
from app.services.market import (
    ExternalAPIError,
    RateLimitedError,
    SymbolNotFoundError,
)
from tests.conftest import SAMPLE_INTRADAY


def make_client(handler) -> AlphaVantageClient:
    settings = Settings(alphavantage_api_key="k", database_url="sqlite://")
    return AlphaVantageClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_parses_intraday_and_converts_to_utc():
    client = make_client(lambda req: httpx.Response(200, json=SAMPLE_INTRADAY))
    bars = client.fetch_bars("IBM", "5min")

    assert [b.ts for b in bars] == [
        datetime(2026, 10, 23, 19, 55, tzinfo=UTC),  # 15:55 US/Eastern (EDT, UTC-4)
        datetime(2026, 10, 23, 20, 0, tzinfo=UTC),
    ]
    assert bars[-1].close == Decimal("101.5")
    assert bars[-1].volume == 1200


def test_sends_expected_query_params():
    seen = {}

    def handler(req: httpx.Request):
        seen.update(req.url.params)
        return httpx.Response(200, json=SAMPLE_INTRADAY)

    make_client(handler).fetch_bars("IBM", "5min")
    assert seen["function"] == "TIME_SERIES_INTRADAY"
    assert seen["interval"] == "5min"
    assert seen["apikey"] == "k"


def test_daily_series():
    payload = {
        "Meta Data": {"5. Time Zone": "US/Eastern"},
        "Time Series (Daily)": {
            "2026-10-23": {
                "1. open": "1",
                "2. high": "2",
                "3. low": "0.5",
                "4. close": "1.5",
                "5. volume": "10",
            }
        },
    }
    bars = make_client(lambda req: httpx.Response(200, json=payload)).fetch_bars("IBM", "daily")
    assert bars[0].ts == datetime(2026, 10, 23, tzinfo=UTC)


@pytest.mark.parametrize(
    ("payload", "error"),
    [
        ({"Error Message": "Invalid API call"}, SymbolNotFoundError),
        ({"Note": "Thank you for using Alpha Vantage! ..."}, RateLimitedError),
        ({"Information": "rate limit"}, RateLimitedError),
        ({"unexpected": True}, ExternalAPIError),
    ],
)
def test_error_payloads(payload, error):
    client = make_client(lambda req: httpx.Response(200, json=payload))
    with pytest.raises(error):
        client.fetch_bars("IBM", "5min")


def test_network_failure_becomes_external_error():
    def handler(req):
        raise httpx.ConnectError("boom")

    with pytest.raises(ExternalAPIError):
        make_client(handler).fetch_bars("IBM", "5min")


def test_missing_api_key_is_rejected():
    with pytest.raises(ExternalAPIError):
        AlphaVantageClient(Settings(alphavantage_api_key="", database_url="sqlite://"))
