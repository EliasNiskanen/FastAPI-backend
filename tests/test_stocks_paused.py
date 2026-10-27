"""Stock prices are paused in production (STOCKS_ENABLED=false): no stock data is served."""

import pytest

from app.config import get_settings


@pytest.fixture
def paused(monkeypatch):
    """Turn stocks off for one test."""
    monkeypatch.setattr(get_settings(), "stocks_enabled", False)


def test_stock_prices_are_404_with_an_explanation(client, fake_fetcher, paused):
    """Stock candles are not served, and the provider is not called."""
    r = client.get("/api/stocks/IBM")
    assert r.status_code == 404
    assert "commercial data licence" in r.json()["detail"]
    assert fake_fetcher.calls == 0


def test_stock_ingest_is_off(client, paused):
    """The scheduled stock ingest can't pull data either."""
    assert client.post("/api/ingest/IBM").status_code == 404


def test_stock_movers_are_404_but_crypto_movers_work(client, paused):
    """Market movers: crypto only."""
    assert client.get("/api/market/movers", params={"asset_class": "stock"}).status_code == 404
    assert client.get("/api/market/movers", params={"asset_class": "crypto"}).status_code == 200


def test_search_returns_only_coins(client, paused):
    """Search finds coins but no stocks."""
    assert client.get("/api/search", params={"q": "apple"}).json()["results"] == []
    coins = client.get("/api/search", params={"q": "bitcoin"}).json()["results"]
    assert [(r["asset_class"], r["symbol"]) for r in coins] == [("crypto", "BTC")]


def test_crypto_prices_are_unaffected(client, paused):
    """Crypto candles still work."""
    assert client.get("/api/crypto/BTC").status_code == 200
