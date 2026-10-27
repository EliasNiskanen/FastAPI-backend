"""Application settings, read from environment variables (or a local .env file).

Every value that differs between your laptop, GCP and AWS lives here, so the
same container image runs everywhere.
"""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """All configurable values. Each field maps to an environment variable of the same name in upper case."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # postgresql+psycopg://user:password@host:5432/dbname
    # Cloud SQL (unix socket): postgresql+psycopg://user:password@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/stocks"

    alphavantage_api_key: str = ""
    alphavantage_base_url: str = "https://www.alphavantage.co/query"
    http_timeout_seconds: float = 15.0

    # Binance public market data (free, no API key)
    binance_base_url: str = "https://data-api.binance.vision"
    default_crypto_quote: str = "USDT"

    # How long stored stock candles count as fresh before we spend an Alpha
    # Vantage request again. The free key allows only ~25 requests per day.
    cache_ttl_minutes: int = Field(default=180, ge=0)
    # Weekly and monthly stock candles barely change during a day.
    stock_long_ttl_minutes: int = Field(default=24 * 60, ge=0)
    # Binance has no daily quota, so crypto (candles and 24h tickers) can
    # refresh much more often.
    crypto_cache_ttl_minutes: int = Field(default=5, ge=0)
    # Stock top gainers/losers: one Alpha Vantage request per refresh.
    stock_movers_ttl_minutes: int = Field(default=360, ge=0)
    # List of all US stock symbols for search; changes rarely (weekly refresh).
    stock_listing_ttl_minutes: int = Field(default=7 * 24 * 60, ge=0)
    # Crypto movers only include coins with at least this much 24h turnover
    # (in the quote currency), so tiny illiquid coins don't dominate the list.
    crypto_movers_min_volume: float = Field(default=10_000_000, ge=0)

    # Comma separated list, e.g. "http://localhost:5173,https://myapp.example.com"
    cors_origins: Annotated[list[str], NoDecode] = []

    # If set, POST /api/ingest/* requires header "X-Ingest-Token: <value>".
    # Use it when a cloud scheduler calls the ingest endpoint.
    ingest_token: str | None = None

    log_level: str = "INFO"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Allow CORS_ORIGINS to be given as a comma-separated string in the environment."""
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    """Return the settings, created once and cached for the lifetime of the process."""
    return Settings()
