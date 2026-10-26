"""API tests for the stock endpoints, caching behaviour and health check."""

from app.config import get_settings
from app.services.market import RateLimitedError, SymbolNotFoundError


def test_health(client):
    """GET /health answers {"status": "ok"} while the process is running."""
    assert client.get("/health").json() == {"status": "ok"}


def test_first_request_fetches_and_stores(client, fake_fetcher):
    """First request fetches and stores."""
    r = client.get("/api/stocks/ibm")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "IBM"
    assert len(body["bars"]) == 2
    assert body["bars"][0]["ts"] < body["bars"][1]["ts"]  # oldest first, ready for charts
    assert fake_fetcher.calls == 1


def test_second_request_is_served_from_database(client, fake_fetcher):
    """Second request is served from database."""
    client.get("/api/stocks/IBM")
    client.get("/api/stocks/IBM")
    assert fake_fetcher.calls == 1  # no extra API quota spent


def test_stale_data_is_refreshed_without_duplicates(client, fake_fetcher, monkeypatch):
    """Stale data is refreshed without duplicates."""
    monkeypatch.setattr(get_settings(), "cache_ttl_minutes", 0)
    client.get("/api/stocks/IBM")
    import time

    time.sleep(0.01)
    r = client.get("/api/stocks/IBM")
    assert fake_fetcher.calls == 2
    assert len(r.json()["bars"]) == 2


def test_limit_returns_latest_bars(client):
    """Limit returns latest bars."""
    bars = client.get("/api/stocks/IBM", params={"limit": 1}).json()["bars"]
    assert len(bars) == 1
    assert bars[0]["close"] == 101.5


def test_invalid_interval_is_422(client):
    """Invalid interval is 422."""
    assert client.get("/api/stocks/IBM", params={"interval": "2min"}).status_code == 422


def test_invalid_symbol_characters_are_422(client):
    """Invalid symbol characters are 422."""
    assert client.get("/api/stocks/IBM;DROP").status_code == 422


def test_unknown_symbol_is_404(client, fake_fetcher):
    """Unknown symbol is 404."""
    fake_fetcher.exc = SymbolNotFoundError("Unknown symbol: XXXX")
    assert client.get("/api/stocks/XXXX").status_code == 404


def test_rate_limit_is_503_with_retry_after(client, fake_fetcher):
    """Rate limit is 503 with retry after."""
    fake_fetcher.exc = RateLimitedError("limit")
    r = client.get("/api/stocks/IBM")
    assert r.status_code == 503
    assert r.headers["retry-after"] == "60"


def test_ingest_without_token_configured(client, fake_fetcher):
    """Ingest without token configured."""
    r = client.post("/api/ingest/IBM")
    assert r.status_code == 200
    assert r.json() == {
        "asset_class": "stock",
        "symbol": "IBM",
        "interval": "5min",
        "new_bars": 2,
    }
    assert client.post("/api/ingest/IBM").json()["new_bars"] == 0


def test_ingest_requires_token_when_configured(client, monkeypatch):
    """Ingest requires token when configured."""
    monkeypatch.setattr(get_settings(), "ingest_token", "secret")
    assert client.post("/api/ingest/IBM").status_code == 401
    assert client.post("/api/ingest/IBM", headers={"X-Ingest-Token": "secret"}).status_code == 200


def test_timestamps_are_returned_in_utc(client):
    """Timestamps are returned in utc."""
    bars = client.get("/api/stocks/IBM").json()["bars"]
    assert bars[-1]["ts"] == "2026-10-23T20:00:00Z"
