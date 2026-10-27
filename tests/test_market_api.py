"""API tests for market-wide endpoints: movers, crypto overview, search and stale fallbacks."""

from datetime import UTC, datetime, timedelta

from app.config import get_settings
from app.models import ApiCache
from app.services import cache
from app.services.market import RateLimitedError


def test_crypto_movers_rank_liquid_coins(client):
    """Crypto movers are sorted by 24h change; stablecoins, other quotes and illiquid coins are left out."""
    body = client.get("/api/market/movers", params={"asset_class": "crypto"}).json()
    assert [m["symbol"] for m in body["gainers"]] == ["MUB", "SOL", "BTC", "BNB"]
    assert [m["symbol"] for m in body["losers"]] == ["DOGE", "ETH"]
    sol = body["gainers"][1]
    assert sol["quote"] == "USDT" and sol["name"] == "Solana"
    assert sol["change_percent"] == 8.4
    assert body["stale"] is False


def test_movers_limit(client):
    """The limit parameter caps each list."""
    body = client.get("/api/market/movers", params={"asset_class": "crypto", "limit": 1}).json()
    assert len(body["gainers"]) == 1 and len(body["losers"]) == 1


def test_stock_movers_skip_penny_stocks_and_warrants(client):
    """Stock movers drop warrants, sub-dollar prices and thinly traded tickers."""
    body = client.get("/api/market/movers", params={"asset_class": "stock"}).json()
    assert [m["symbol"] for m in body["gainers"]] == ["NVDA"]
    assert [m["symbol"] for m in body["losers"]] == ["INTC"]
    assert body["gainers"][0]["asset_class"] == "stock"


def test_market_data_is_cached(client, fake_sources):
    """Movers, overview and search share one cached Binance response."""
    client.get("/api/market/movers")
    client.get("/api/market/crypto")
    client.get("/api/search", params={"q": "sol"})
    cache.clear_memo()  # force a read from the database table
    client.get("/api/market/movers")
    assert fake_sources.calls["crypto"] == 1


def test_crypto_overview_keeps_requested_order(client):
    """The overview returns the requested coins in order and skips unknown ones."""
    body = client.get("/api/market/crypto", params={"symbols": "eth,NOPE,btc"}).json()
    assert [i["symbol"] for i in body["items"]] == ["ETH", "BTC"]


def test_crypto_overview_defaults_to_majors(client):
    """Without symbols the overview lists the major coins that exist in the data."""
    body = client.get("/api/market/crypto").json()
    assert [i["symbol"] for i in body["items"]] == ["BTC", "ETH", "SOL", "BNB", "DOGE"]


def test_crypto_overview_validates_symbols(client):
    """Symbols must be a plain comma-separated list."""
    assert client.get("/api/market/crypto", params={"symbols": "BTC;DROP"}).status_code == 422


def test_stale_cache_is_served_when_provider_fails(client, session, fake_sources):
    """An expired entry is still served (stale=true) if the provider is rate limited."""
    client.get("/api/market/movers")
    row = session.get(ApiCache, "crypto:tickers:USDT")
    row.fetched_at = datetime.now(UTC) - timedelta(hours=2)
    session.commit()
    cache.clear_memo()
    fake_sources.fail["crypto"] = RateLimitedError("limit")

    body = client.get("/api/market/movers").json()
    assert body["stale"] is True
    assert "SOL" in [m["symbol"] for m in body["gainers"]]


def test_provider_failure_without_cache_is_503(client, fake_sources):
    """With nothing cached yet, a rate-limited provider gives 503 + Retry-After."""
    fake_sources.fail["movers"] = RateLimitedError("limit")
    r = client.get("/api/market/movers", params={"asset_class": "stock"})
    assert r.status_code == 503
    assert r.headers["retry-after"] == "60"


def test_search_ranks_exact_ticker_first(client):
    """An exact ticker beats prefix and name matches."""
    results = client.get("/api/search", params={"q": "aapl"}).json()["results"]
    assert results[0] == {
        "asset_class": "stock",
        "symbol": "AAPL",
        "name": "Apple Inc",
        "exchange": "NASDAQ",
        "quote": None,
    }


def test_search_by_name_finds_stocks_and_coins(client):
    """Names match by word prefix, across stocks and crypto."""
    names = [
        r["symbol"] for r in client.get("/api/search", params={"q": "apple"}).json()["results"]
    ]
    assert names == ["AAPL", "APLE"]
    coin = client.get("/api/search", params={"q": "bitcoin"}).json()["results"][0]
    assert coin["asset_class"] == "crypto" and coin["symbol"] == "BTC" and coin["quote"] == "USDT"


def test_search_is_partial_when_a_source_fails(client, fake_sources):
    """If the stock list can't be loaded, crypto results still come back, flagged partial."""
    fake_sources.fail["listing"] = RateLimitedError("limit")
    body = client.get("/api/search", params={"q": "sol"}).json()
    assert body["partial"] is True
    assert [r["symbol"] for r in body["results"]] == ["SOL"]


def test_search_requires_query(client):
    """An empty query is rejected by validation."""
    assert client.get("/api/search", params={"q": ""}).status_code == 422


def test_stale_candles_are_served_when_refresh_fails(client, fake_fetcher, monkeypatch):
    """Stored candles are returned with stale=true when the provider can't refresh them."""
    client.get("/api/stocks/IBM")
    monkeypatch.setattr(get_settings(), "cache_ttl_minutes", -1)  # everything is stale
    fake_fetcher.exc = RateLimitedError("limit")
    r = client.get("/api/stocks/IBM")
    assert r.status_code == 200
    assert r.json()["stale"] is True
    assert len(r.json()["bars"]) == 2


def test_stock_movers_get_names_from_cached_listing(client, fake_sources):
    """Once the symbol list is cached (by a search), movers show company names."""
    client.get("/api/market/movers", params={"asset_class": "stock"})
    assert fake_sources.calls["listing"] == 0  # movers alone never fetch the listing
    client.get("/api/search", params={"q": "msft"})
    cache.clear_memo()
    body = client.get("/api/market/movers", params={"asset_class": "stock"}).json()
    assert body["gainers"][0]["name"] == "NVIDIA Corporation"
    assert fake_sources.calls["listing"] == 1


def test_tokenized_stocks_are_not_crypto_movers(client):
    """Binance's tokenized stocks (ticker + "B") are dropped once the stock list is known."""
    first = client.get("/api/market/movers").json()
    assert first["gainers"][0]["symbol"] == "MUB"  # stock list not cached yet

    client.get("/api/search", params={"q": "micron"})  # caches the stock list
    gainers = [m["symbol"] for m in client.get("/api/market/movers").json()["gainers"]]
    assert "MUB" not in gainers
    assert "BNB" in gainers  # known coins are never treated as stocks


def test_search_shows_the_stock_not_its_token(client):
    """Searching a tokenized ticker returns the real stock only."""
    results = client.get("/api/search", params={"q": "mu"}).json()["results"]
    assert ("stock", "MU") in [(r["asset_class"], r["symbol"]) for r in results]
    assert "MUB" not in [r["symbol"] for r in results]
