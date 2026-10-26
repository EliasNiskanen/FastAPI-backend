"""API tests for the crypto endpoints and crypto ingest."""

from decimal import Decimal

from app.services.market import Bar, SymbolNotFoundError


def test_default_quote_is_usdt(client, fake_crypto_fetcher):
    """Default quote is usdt."""
    r = client.get("/api/crypto/btc")
    assert r.status_code == 200
    body = r.json()
    assert body["asset_class"] == "crypto"
    assert body["symbol"] == "BTCUSDT"
    assert fake_crypto_fetcher.last_symbol == "BTCUSDT"
    assert body["bars"][0]["volume"] == 12.34567


def test_custom_quote(client, fake_crypto_fetcher):
    """Custom quote."""
    r = client.get("/api/crypto/eth", params={"quote": "eur", "interval": "daily"})
    assert r.json()["symbol"] == "ETHEUR"
    assert fake_crypto_fetcher.last_symbol == "ETHEUR"


def test_crypto_is_cached(client, fake_crypto_fetcher):
    """Crypto is cached."""
    client.get("/api/crypto/BTC")
    client.get("/api/crypto/BTC")
    assert fake_crypto_fetcher.calls == 1


def test_stock_and_crypto_do_not_mix(client, fake_fetcher, fake_crypto_fetcher):
    """Stock and crypto do not mix."""
    client.get("/api/stocks/IBM")
    client.get("/api/crypto/BTC")
    stock = client.get("/api/stocks/IBM").json()["bars"]
    assert [b["close"] for b in stock] == [101.0, 101.5]


def test_ingest_updates_open_candle(client, fake_crypto_fetcher):
    """Ingest updates open candle."""
    client.post("/api/ingest/crypto/BTC")
    last = fake_crypto_fetcher.bars[-1]
    # The still-open candle moved on before the next ingest
    fake_crypto_fetcher.bars = [
        *fake_crypto_fetcher.bars[:-1],
        Bar(
            ts=last.ts,
            open=last.open,
            high=Decimal(99000),
            low=last.low,
            close=Decimal(98900),
            volume=Decimal(20),
        ),
    ]
    r = client.post("/api/ingest/crypto/BTC")
    assert r.json()["new_bars"] == 0
    bars = client.get("/api/crypto/BTC").json()["bars"]
    assert bars[-1]["close"] == 98900.0
    assert bars[-1]["volume"] == 20.0
    assert len(bars) == 2


def test_unknown_pair_is_404(client, fake_crypto_fetcher):
    """Unknown pair is 404."""
    fake_crypto_fetcher.exc = SymbolNotFoundError("Unknown trading pair: NOPEUSDT")
    assert client.get("/api/crypto/NOPE").status_code == 404


def test_invalid_pair_characters_are_422(client):
    """Invalid pair characters are 422."""
    assert client.get("/api/crypto/BTC-USD").status_code == 422
    assert client.get("/api/crypto/BTC", params={"quote": "U$D"}).status_code == 422
