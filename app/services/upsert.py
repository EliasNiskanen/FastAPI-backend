"""INSERT ... ON CONFLICT DO UPDATE ("upsert") for PostgreSQL and SQLite.

Several requests can ask for the same new symbol at the same moment (the
dashboard's panels load in parallel). Read-then-insert would let two of them
insert the same rows and one would fail on the unique constraint. An upsert is
a single atomic statement, so concurrent writers simply overwrite each other
with the same data.
"""

from collections.abc import Sequence
from typing import Any

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

# SQLite allows at most 32766 bound parameters per statement; stay well below.
_CHUNK_PARAMS = 30_000


def upsert(
    session: Session,
    model: Any,
    rows: Sequence[dict[str, Any]],
    key_columns: Sequence[str],
    update_columns: Sequence[str],
) -> None:
    """Insert `rows`; where a row with the same key exists, update `update_columns` instead."""
    if not rows:
        return
    dialect = session.get_bind().dialect.name
    insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
    per_chunk = max(1, _CHUNK_PARAMS // len(rows[0]))
    for start in range(0, len(rows), per_chunk):
        stmt = insert(model).values(list(rows[start : start + per_chunk]))
        stmt = stmt.on_conflict_do_update(
            index_elements=list(key_columns),
            set_={col: stmt.excluded[col] for col in update_columns},
        )
        session.execute(stmt)
