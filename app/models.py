"""Database tables (SQLAlchemy ORM models). Change these, then create an Alembic migration."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PriceBar(Base):
    """One OHLCV candle for a stock or crypto pair. Timestamps are stored in UTC."""

    __tablename__ = "price_bars"
    __table_args__ = (
        UniqueConstraint("asset_class", "symbol", "interval", "ts", name="uq_price_bar"),
    )

    # BIGINT in Postgres; plain INTEGER in SQLite so autoincrement works in tests.
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer(), "sqlite"), primary_key=True
    )
    asset_class: Mapped[str] = mapped_column(String(16))  # "stock" | "crypto"
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    interval: Mapped[str] = mapped_column(String(16))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    open: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    high: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    low: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    close: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    volume: Mapped[Decimal] = mapped_column(Numeric(30, 8))


class FetchLog(Base):
    """When each (asset class, symbol, interval) was last pulled from an external API.

    This is what lets us answer from our own database instead of spending
    one of the limited API requests.
    """

    __tablename__ = "fetch_log"

    asset_class: Mapped[str] = mapped_column(String(16), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    interval: Mapped[str] = mapped_column(String(16), primary_key=True)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
