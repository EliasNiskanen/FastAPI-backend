"""Application settings, read from environment variables (or a local .env file).

Every value that differs between your laptop, GCP and AWS lives here, so the
same container image runs everywhere.
"""

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # postgresql+psycopg://user:password@host:5432/dbname
    # Cloud SQL (unix socket): postgresql+psycopg://user:password@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/stocks"

    alphavantage_api_key: str = ""
    alphavantage_base_url: str = "https://www.alphavantage.co/query"
    http_timeout_seconds: float = 15.0

    # How long stored data counts as fresh before we spend an API request again.
    cache_ttl_minutes: int = Field(default=60, ge=0)

    # Comma separated list, e.g. "http://localhost:5173,https://myapp.example.com"
    cors_origins: Annotated[list[str], NoDecode] = []

    # If set, POST /api/ingest/* requires header "X-Ingest-Token: <value>".
    # Use it when a cloud scheduler calls the ingest endpoint.
    ingest_token: str | None = None

    log_level: str = "INFO"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
