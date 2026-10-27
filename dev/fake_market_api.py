"""Offline stand-in for Alpha Vantage and Binance, for local development and demos.

Serves realistic-looking, deterministic random-walk data in the same formats
as the real APIs, so the backend and frontend can run without API keys,
quotas or network access:

    python dev/fake_market_api.py --port 9100

    ALPHAVANTAGE_API_KEY=dev \\
    ALPHAVANTAGE_BASE_URL=http://127.0.0.1:9100/query \\
    BINANCE_BASE_URL=http://127.0.0.1:9100 \\
    poetry run uvicorn app.main:app --reload

Implemented: Alpha Vantage TIME_SERIES_INTRADAY, TIME_SERIES_DAILY,
TOP_GAINERS_LOSERS, LISTING_STATUS; Binance /api/v3/klines, /api/v3/ticker/24hr.
"""

import argparse
import hashlib
import json
import math
import random
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("US/Eastern")

# symbol -> (name, exchange, typical price)
STOCKS = {
    "AAPL": ("Apple Inc", "NASDAQ", 228.0),
    "MSFT": ("Microsoft Corporation", "NASDAQ", 431.0),
    "NVDA": ("NVIDIA Corporation", "NASDAQ", 139.0),
    "AMZN": ("Amazon.com Inc", "NASDAQ", 187.0),
    "GOOGL": ("Alphabet Inc - Class A", "NASDAQ", 166.0),
    "META": ("Meta Platforms Inc - Class A", "NASDAQ", 573.0),
    "TSLA": ("Tesla Inc", "NASDAQ", 262.0),
    "IBM": ("International Business Machines Corp", "NYSE", 253.0),
    "JPM": ("JPMorgan Chase & Co", "NYSE", 224.0),
    "V": ("Visa Inc - Class A", "NYSE", 289.0),
    "NFLX": ("Netflix Inc", "NASDAQ", 754.0),
    "AMD": ("Advanced Micro Devices Inc", "NASDAQ", 156.0),
    "INTC": ("Intel Corporation", "NASDAQ", 22.0),
    "DIS": ("Walt Disney Co", "NYSE", 96.0),
    "KO": ("Coca-Cola Co", "NYSE", 68.0),
    "NKE": ("Nike Inc - Class B", "NYSE", 79.0),
    "PLTR": ("Palantir Technologies Inc - Class A", "NASDAQ", 44.0),
    "UBER": ("Uber Technologies Inc", "NYSE", 77.0),
    "SHOP": ("Shopify Inc - Class A", "NYSE", 81.0),
    "COIN": ("Coinbase Global Inc - Class A", "NASDAQ", 212.0),
    "SPY": ("SPDR S&P 500 ETF Trust", "NYSE ARCA", 579.0),
    "QQQ": ("Invesco QQQ Trust Series 1", "NASDAQ", 496.0),
}

# base -> typical price in USDT
COINS = {
    "BTC": 98250.0, "ETH": 3480.0, "SOL": 182.0, "BNB": 612.0, "XRP": 0.58,
    "DOGE": 0.21, "ADA": 0.36, "AVAX": 27.4, "LINK": 11.9, "DOT": 4.4,
    "TRX": 0.16, "LTC": 72.0, "BCH": 362.0, "SHIB": 0.0000182, "TON": 5.2,
    "NEAR": 4.9, "APT": 9.8, "ARB": 0.55, "OP": 1.62, "SUI": 2.1, "PEPE": 0.0000095,
    "UNI": 8.3, "AAVE": 158.0, "INJ": 21.0, "RENDER": 5.4, "TAO": 480.0, "FET": 1.3,
}  # fmt: skip

INTERVAL_MINUTES = {"1min": 1, "5min": 5, "15min": 15, "30min": 30, "60min": 60}
BINANCE_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440}


def _rng(*parts: object) -> random.Random:
    """A random generator seeded from the arguments, so the same request gives the same data."""
    seed = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return random.Random(int(seed[:16], 16))


def _walk(
    symbol: str,
    base_price: float,
    times: list[datetime],
    minutes: int,
    change_pct: float | None = None,
) -> list[tuple]:
    """Random-walk OHLCV candles that end at base_price, one per timestamp.

    If change_pct is given, the walk is bent so the price 24 hours before the
    last candle matches it, keeping charts consistent with the 24h tickers.
    """
    rng = _rng(symbol, minutes, times[0].date() if times else "")
    vol = 0.018 * math.sqrt(minutes / 1440)  # ~1.8% daily volatility
    drift = rng.uniform(-0.25, 0.25) * vol
    closes = [1.0]
    for _ in times[1:]:
        closes.append(closes[-1] * math.exp(rng.gauss(drift, vol)))
    day_back = len(closes) - 1 - (1440 // minutes)
    if change_pct is not None and 0 <= day_back < len(closes) - 1:
        wanted = 1 / (1 + change_pct / 100)  # price a day ago relative to the last price
        actual = closes[day_back] / closes[-1]
        bend = wanted / actual
        last = len(closes) - 1
        for i in range(len(closes)):
            weight = 1.0 if i <= day_back else (last - i) / (last - day_back)
            closes[i] *= bend**weight
    scale = base_price / closes[-1]
    rows = []
    prev = closes[0] * scale
    for ts, c in zip(times, closes, strict=True):
        close = c * scale
        open_ = prev
        wick = abs(rng.gauss(0, vol * 0.6))
        high = max(open_, close) * (1 + wick)
        low = min(open_, close) * (1 - abs(rng.gauss(0, vol * 0.6)))
        volume = rng.uniform(0.5, 1.6) * (1e6 if base_price > 1 else 1e9) * (minutes / 60 + 0.2)
        rows.append((ts, open_, high, low, close, volume))
        prev = close
    return rows


def _fmt(x: float) -> str:
    """Format a price with enough precision for both $0.00001 coins and $90k BTC."""
    return f"{x:.8f}" if x < 1 else f"{x:.4f}"


def _intraday_times(minutes: int, count: int) -> list[datetime]:
    """The last `count` candle start times for an interval, ending at the current one (UTC)."""
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    now -= timedelta(minutes=now.minute % minutes if minutes < 60 else now.minute)
    if minutes >= 1440:
        now = now.replace(hour=0, minute=0)
    return [now - timedelta(minutes=minutes * i) for i in range(count - 1, -1, -1)]


def _weekdays(count: int) -> list[datetime]:
    """The last `count` weekdays at midnight UTC, oldest first."""
    days, d = [], datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    while len(days) < count:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


def _daily_change(symbol: str, base_price: float) -> tuple[float, float]:
    """Today's change and change percent for a symbol, consistent across endpoints."""
    pct = _rng("change", symbol, datetime.now(UTC).date()).gauss(0, 3.2)
    prev = base_price / (1 + pct / 100)
    return base_price - prev, pct


# ---------------------------------------------------------------- Alpha Vantage


def alphavantage(params: dict[str, str]) -> tuple[int, str, str]:
    """Answer an Alpha Vantage /query request: (status, content type, body)."""
    fn = params.get("function", "")
    symbol = params.get("symbol", "").upper()

    if fn in ("TIME_SERIES_INTRADAY", "TIME_SERIES_DAILY"):
        if symbol not in STOCKS:
            return 200, "application/json", json.dumps({"Error Message": "Invalid API call."})
        price = STOCKS[symbol][2]
        if fn == "TIME_SERIES_DAILY":
            rows = _walk(symbol, price, _weekdays(100), 1440, _daily_change(symbol, price)[1])
            series = {
                ts.strftime("%Y-%m-%d"): _av_row(o, h, lo, c, v) for ts, o, h, lo, c, v in rows
            }
            key = "Time Series (Daily)"
        else:
            interval = params.get("interval", "5min")
            minutes = INTERVAL_MINUTES.get(interval, 5)
            rows = _walk(
                symbol,
                price,
                _intraday_times(minutes, 100),
                minutes,
                _daily_change(symbol, price)[1],
            )
            series = {
                ts.astimezone(EASTERN).strftime("%Y-%m-%d %H:%M:%S"): _av_row(o, h, lo, c, v)
                for ts, o, h, lo, c, v in rows
            }
            key = f"Time Series ({interval})"
        meta = {"2. Symbol": symbol, "5. Time Zone": "US/Eastern"}
        return 200, "application/json", json.dumps({"Meta Data": meta, key: series})

    if fn == "TOP_GAINERS_LOSERS":
        movers = []
        for sym, (_, _, price) in STOCKS.items():
            change, pct = _daily_change(sym, price)
            movers.append(
                {
                    "ticker": sym,
                    "price": f"{price:.2f}",
                    "change_amount": f"{change:.4f}",
                    "change_percentage": f"{pct:.4f}%",
                    "volume": str(int(_rng("vol", sym).uniform(2e6, 9e7))),
                }
            )
        movers.sort(key=lambda m: float(m["change_percentage"].rstrip("%")), reverse=True)
        body = {
            "metadata": "Top gainers, losers, and most actively traded US tickers",
            "last_updated": datetime.now(EASTERN).strftime("%Y-%m-%d %H:%M:%S US/Eastern"),
            "top_gainers": movers[:10],
            "top_losers": list(reversed(movers))[:10],
            "most_actively_traded": [],
        }
        return 200, "application/json", json.dumps(body)

    if fn == "LISTING_STATUS":
        lines = ["symbol,name,exchange,assetType,ipoDate,delistingDate,status"]
        for sym, (name, exchange, _) in STOCKS.items():
            kind = "ETF" if sym in ("SPY", "QQQ") else "Stock"
            lines.append(f"{sym},{name},{exchange},{kind},2000-01-01,null,Active")
        return 200, "text/csv", "\r\n".join(lines) + "\r\n"

    return 200, "application/json", json.dumps({"Error Message": f"Unknown function {fn}"})


def _av_row(o: float, h: float, lo: float, c: float, v: float) -> dict:
    """One Alpha Vantage time series entry."""
    return {
        "1. open": f"{o:.4f}",
        "2. high": f"{h:.4f}",
        "3. low": f"{lo:.4f}",
        "4. close": f"{c:.4f}",
        "5. volume": str(int(v)),
    }


# ---------------------------------------------------------------- Binance


def _coin_price(symbol: str) -> float | None:
    """Price of a Binance pair such as BTCUSDT or ETHEUR, or None if unknown."""
    for quote, fx in (("USDT", 1.0), ("EUR", 0.92), ("USDC", 1.0)):
        if symbol.endswith(quote) and symbol[: -len(quote)] in COINS:
            return COINS[symbol[: -len(quote)]] * fx
    return None


def binance(path: str, params: dict[str, str]) -> tuple[int, str, str]:
    """Answer a Binance market data request: (status, content type, body)."""
    if path == "/api/v3/klines":
        symbol = params.get("symbol", "").upper()
        price = _coin_price(symbol)
        if price is None:
            return 400, "application/json", json.dumps({"code": -1121, "msg": "Invalid symbol."})
        minutes = BINANCE_MINUTES.get(params.get("interval", "5m"), 5)
        count = min(int(params.get("limit", 500)), 1000)
        base = next(symbol[: -len(q)] for q in ("USDT", "EUR", "USDC") if symbol.endswith(q))
        _, pct = _daily_change(base, price)
        rows = _walk(symbol, price, _intraday_times(minutes, count), minutes, pct)
        body = [
            [
                int(ts.timestamp() * 1000),
                _fmt(o),
                _fmt(h),
                _fmt(lo),
                _fmt(c),
                f"{v / max(c, 1e-9):.5f}",
                int((ts + timedelta(minutes=minutes)).timestamp() * 1000) - 1,
                f"{v:.2f}",
                1000,
                "0",
                "0",
                "0",
            ]
            for ts, o, h, lo, c, v in rows
        ]
        return 200, "application/json", json.dumps(body)

    if path == "/api/v3/ticker/24hr":
        out = []
        for base, price in COINS.items():
            for quote, fx in (("USDT", 1.0), ("EUR", 0.92)):
                p = price * fx
                change, pct = _daily_change(base, p)
                volume = _rng("qv", base).uniform(2e7, 2e9) * (3 if base in ("BTC", "ETH") else 1)
                out.append(
                    {
                        "symbol": base + quote,
                        "lastPrice": _fmt(p),
                        "priceChange": _fmt(change) if change >= 0 else "-" + _fmt(-change),
                        "priceChangePercent": f"{pct:.3f}",
                        "highPrice": _fmt(p * 1.03),
                        "lowPrice": _fmt((p - change) * 0.97),
                        "quoteVolume": f"{volume * (1 if quote == 'USDT' else 0.05):.2f}",
                    }
                )
        out.append({"symbol": "USDCUSDT", "lastPrice": "1.0001", "priceChange": "0.0001",
                    "priceChangePercent": "0.010", "highPrice": "1.0003", "lowPrice": "0.9998",
                    "quoteVolume": "3000000000"})  # fmt: skip
        return 200, "application/json", json.dumps(out)

    return 404, "application/json", json.dumps({"code": -1, "msg": "Not found"})


class Handler(BaseHTTPRequestHandler):
    """Routes /query to the fake Alpha Vantage and /api/v3/* to the fake Binance."""

    def do_GET(self) -> None:
        """Handle one GET request."""
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/query":
            status, ctype, body = alphavantage(params)
        else:
            status, ctype, body = binance(url.path, params)
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args: object) -> None:
        """Keep the console quiet."""


def main() -> None:
    """Parse arguments and serve until interrupted."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=9100)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Fake market API on http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
