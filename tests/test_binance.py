from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from app.config import Settings
from app.services.binance import BinanceClient
from app.services.market import ExternalAPIError, RateLimitedError, SymbolNotFoundError
from tests.conftest import SAMPLE_KLINES


def make_client(handler) -> BinanceClient:
    settings = Settings(database_url="sqlite://", binance_base_url="https://binance.test")
    return BinanceClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_parses_klines():
    bars = make_client(lambda req: httpx.Response(200, json=SAMPLE_KLINES)).fetch_bars(
        "BTCUSDT", "5min"
    )
    assert bars[0].ts == datetime(2025, 10, 27, 20, 0, tzinfo=UTC)
    assert bars[0].volume == Decimal("12.34567")  # fractional volume kept exactly
    assert bars[1].close == Decimal("98650.00")


@pytest.mark.parametrize(
    ("ours", "binance"),
    [("1min", "1m"), ("5min", "5m"), ("60min", "1h"), ("daily", "1d")],
)
def test_interval_mapping_and_params(ours, binance):
    seen = {}

    def handler(req: httpx.Request):
        seen["path"] = req.url.path
        seen.update(req.url.params)
        return httpx.Response(200, json=[])

    make_client(handler).fetch_bars("ETHEUR", ours)
    assert seen["path"] == "/api/v3/klines"
    assert seen["symbol"] == "ETHEUR"
    assert seen["interval"] == binance
    assert seen["limit"] == "1000"


def test_invalid_symbol():
    client = make_client(
        lambda req: httpx.Response(400, json={"code": -1121, "msg": "Invalid symbol."})
    )
    with pytest.raises(SymbolNotFoundError):
        client.fetch_bars("NOPEUSDT", "daily")


@pytest.mark.parametrize("status", [418, 429])
def test_rate_limited(status):
    client = make_client(lambda req: httpx.Response(status, json={"code": -1003}))
    with pytest.raises(RateLimitedError):
        client.fetch_bars("BTCUSDT", "daily")


def test_other_error_and_bad_format():
    with pytest.raises(ExternalAPIError):
        make_client(lambda req: httpx.Response(500, json={"code": -1000})).fetch_bars(
            "BTCUSDT", "daily"
        )
    with pytest.raises(ExternalAPIError):
        make_client(lambda req: httpx.Response(200, json={"oops": 1})).fetch_bars(
            "BTCUSDT", "daily"
        )


def test_network_failure():
    def handler(req):
        raise httpx.ConnectError("boom")

    with pytest.raises(ExternalAPIError):
        make_client(handler).fetch_bars("BTCUSDT", "daily")
