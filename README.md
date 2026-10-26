# FastAPI backend for a stock / crypto market visualization app

Backend for a personal full-stack webapp that visualizes stock and crypto
markets. Free market data API keys are limited by daily requests, so the
backend stores everything it fetches in its own PostgreSQL database and only
calls the external API when stored data is stale.

## Features

- **Database-first reads**: `GET /api/stocks/{symbol}` answers from PostgreSQL
  and refreshes from Alpha Vantage only after `CACHE_TTL_MINUTES`.
- **Scheduled ingest**: `POST /api/ingest/{symbol}` (token-protected), called by a
  GitHub Actions cron so data accumulates over time.
- **Intervals**: `1min`, `5min`, `15min`, `30min`, `60min`, `daily`. Timestamps stored and returned in UTC.
- **Error handling**: unknown symbol → 404, provider rate limit → 503 with `Retry-After`,
  provider down → 502, database down → 503. The API key never appears in logs.
- **Cloud ready**: one Docker image, config from env vars, health checks,
  Alembic migrations, deploy workflows for Google Cloud Run and AWS ECS.

## Project layout

```
app/
  main.py              FastAPI app, error handlers, health checks
  config.py            settings from environment variables
  db.py, models.py     SQLAlchemy engine and tables
  routers/stocks.py    HTTP endpoints
  services/
    alphavantage.py    external API client
    prices.py          caching / ingest logic
alembic/               database migrations
tests/                 pytest suite (no network, SQLite)
docs/DEPLOY.md         GCP and AWS deployment guide
```

## Run locally

With Docker (API + PostgreSQL):

```bash
cp .env.example .env        # add your Alpha Vantage key
docker compose up --build
```

Without Docker (needs a local PostgreSQL):

```bash
poetry install
cp .env.example .env
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

```bash
curl "http://localhost:8000/api/stocks/IBM?interval=5min&limit=100"
```

## Tests

```bash
poetry run pytest
poetry run ruff check .
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for Google Cloud (Cloud Run + Cloud SQL)
and AWS (ECS Express Mode + RDS).

## Roadmap

- Crypto data source
- Frontend for visualization
- Derived indicators (moving averages, volatility) computed from stored data
