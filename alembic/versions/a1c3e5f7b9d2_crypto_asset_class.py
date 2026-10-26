"""Add asset_class (stock/crypto) and fractional volumes

Revision ID: a1c3e5f7b9d2
Revises: c95189bc386a
Create Date: 2026-10-27

Existing rows are Alpha Vantage stock data, so they get asset_class='stock'.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1c3e5f7b9d2"
down_revision: str | None = "c95189bc386a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRICE_COLUMNS = ("open", "high", "low", "close")


def upgrade() -> None:
    # price_bars
    op.add_column(
        "price_bars",
        sa.Column("asset_class", sa.String(16), nullable=False, server_default="stock"),
    )
    op.alter_column("price_bars", "asset_class", server_default=None)
    op.drop_constraint("uq_price_bar", "price_bars", type_="unique")
    op.create_unique_constraint(
        "uq_price_bar", "price_bars", ["asset_class", "symbol", "interval", "ts"]
    )
    for col in PRICE_COLUMNS:
        op.alter_column("price_bars", col, type_=sa.Numeric(24, 8), existing_type=sa.Numeric(20, 8))
    op.alter_column(
        "price_bars",
        "volume",
        type_=sa.Numeric(30, 8),
        existing_type=sa.BigInteger(),
        postgresql_using="volume::numeric(30,8)",
    )

    # fetch_log
    op.add_column(
        "fetch_log",
        sa.Column("asset_class", sa.String(16), nullable=False, server_default="stock"),
    )
    op.alter_column("fetch_log", "asset_class", server_default=None)
    op.drop_constraint("fetch_log_pkey", "fetch_log", type_="primary")
    op.create_primary_key("fetch_log_pkey", "fetch_log", ["asset_class", "symbol", "interval"])


def downgrade() -> None:
    op.execute("DELETE FROM price_bars WHERE asset_class <> 'stock'")
    op.execute("DELETE FROM fetch_log WHERE asset_class <> 'stock'")

    op.drop_constraint("fetch_log_pkey", "fetch_log", type_="primary")
    op.drop_column("fetch_log", "asset_class")
    op.create_primary_key("fetch_log_pkey", "fetch_log", ["symbol", "interval"])

    op.alter_column(
        "price_bars",
        "volume",
        type_=sa.BigInteger(),
        existing_type=sa.Numeric(30, 8),
        postgresql_using="round(volume)::bigint",
    )
    for col in PRICE_COLUMNS:
        op.alter_column("price_bars", col, type_=sa.Numeric(20, 8), existing_type=sa.Numeric(24, 8))
    op.drop_constraint("uq_price_bar", "price_bars", type_="unique")
    op.create_unique_constraint("uq_price_bar", "price_bars", ["symbol", "interval", "ts"])
    op.drop_column("price_bars", "asset_class")
