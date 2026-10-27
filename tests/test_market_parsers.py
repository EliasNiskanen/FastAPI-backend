"""Unit tests for parsing the market-wide provider responses (movers, listing, 24h tickers)."""

import httpx
import pytest

from app.config import Settings
from app.services.alphavantage import AlphaVantageClient
from app.services.binance import BinanceClient
from app.services.market import ExternalAPIError, RateLimitedError
from tests.conftest import SAMPLE_TICKERS

AV_MOVERS = {
    "metadata": "Top gainers, losers, and most actively traded US tickers",
    "last_updated": "2026-10-26 16:15:59 US/Eastern",
    "top_gainers": [
        {
            "ticker": "NVDA",
            "price": "140.0",
            "change_amount": "9.1",
            "change_percentage": "6.95%",
            "volume": "300000000",
        },
        {"ticker": "BROKEN", "price": "n/a"},
    ],
    "top_losers": [
        {
            "ticker": "INTC",
            "price": "21.0",
            "change_amount": "-2.4",
            "change_percentage": "-10.26%",
            "volume": "90000000",
        }
    ],
    "most_actively_traded": [],
}


def av_client(handler) -> AlphaVantageClient:
    """AlphaVantageClient answered by `handler` instead of the network."""
    settings = Settings(alphavantage_api_key="k", database_url="sqlite://")
    return AlphaVantageClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))


def binance_client(handler) -> BinanceClient:
    """BinanceClient answered by `handler` instead of the network."""
    settings = Settings(database_url="sqlite://", binance_base_url="https://binance.test")
    return BinanceClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_parses_top_movers_and_skips_bad_rows():
    """Percent strings become numbers; rows with unparseable values are dropped."""
    movers = av_client(lambda req: httpx.Response(200, json=AV_MOVERS)).fetch_top_movers()
    assert movers["gainers"] == [
        {"symbol": "NVDA", "price": 140.0, "change": 9.1, "change_percent": 6.95, "volume": 3e8}
    ]
    assert movers["losers"][0]["change_percent"] == -10.26
    assert movers["last_updated"].startswith("2026-10-26")


def test_movers_quota_message_is_rate_limit():
    """A quota/premium "Information" body is reported as a rate limit."""
    client = av_client(lambda req: httpx.Response(200, json={"Information": "premium"}))
    with pytest.raises(RateLimitedError):
        client.fetch_top_movers()


def test_parses_listing_csv():
    """LISTING_STATUS CSV becomes compact [symbol, name, exchange, type] rows."""
    csv_text = (
        "symbol,name,exchange,assetType,ipoDate,delistingDate,status\r\n"
        "AAPL,Apple Inc,NASDAQ,Stock,1980-12-12,null,Active\r\n"
        "SPY,SPDR S&P 500 ETF Trust,NYSE ARCA,ETF,1993-01-29,null,Active\r\n"
    )
    seen = {}

    def handler(req: httpx.Request):
        """Fake endpoint that records the requested function."""
        seen.update(req.url.params)
        return httpx.Response(200, text=csv_text)

    rows = av_client(handler).fetch_listing()
    assert seen["function"] == "LISTING_STATUS"
    assert rows == [
        ["AAPL", "Apple Inc", "NASDAQ", "Stock"],
        ["SPY", "SPDR S&P 500 ETF Trust", "NYSE ARCA", "ETF"],
    ]


def test_listing_json_error_is_rate_limit():
    """A JSON quota message instead of CSV is reported as a rate limit."""
    client = av_client(lambda req: httpx.Response(200, json={"Note": "limit"}))
    with pytest.raises(RateLimitedError):
        client.fetch_listing()


def test_listing_unexpected_format():
    """Something that is neither CSV with a symbol column nor JSON is an external error."""
    client = av_client(lambda req: httpx.Response(200, text="hello\nworld"))
    with pytest.raises(ExternalAPIError):
        client.fetch_listing()


def test_fetches_24h_tickers():
    """GET /api/v3/ticker/24hr returns the raw list."""
    seen = {}

    def handler(req: httpx.Request):
        """Fake endpoint that records the path."""
        seen["path"] = req.url.path
        return httpx.Response(200, json=SAMPLE_TICKERS)

    rows = binance_client(handler).fetch_24h_tickers()
    assert seen["path"] == "/api/v3/ticker/24hr"
    assert rows[0]["symbol"] == "BTCUSDT"


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(429, json={"code": -1003}), RateLimitedError),
        (httpx.Response(500, json={"code": -1000}), ExternalAPIError),
        (httpx.Response(200, json={"oops": 1}), ExternalAPIError),
    ],
)
def test_24h_ticker_errors(response, error):
    """Rate limits, server errors and unexpected bodies map to our error types."""
    with pytest.raises(error):
        binance_client(lambda req: response).fetch_24h_tickers()
