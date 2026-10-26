"""Database connection setup: SQLAlchemy engine, session factory and the Base for models."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class every database model inherits from; it collects the table definitions."""


@lru_cache
def get_engine() -> Engine:
    """Create the database engine (connection pool) once and reuse it."""
    # pool_pre_ping drops dead connections, which matters on managed databases
    # (Cloud SQL / RDS) that close idle connections.
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    """Create the factory that produces database sessions, once."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    session = _session_factory()()
    try:
        yield session
    finally:
        session.close()
