"""Dependencies shared by the stock and crypto routers."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status

from app.config import Settings, get_settings

Limit = Annotated[int, Query(ge=1, le=5000, description="How many latest bars to return")]


def require_ingest_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ingest_token: Annotated[str | None, Header()] = None,
) -> None:
    """Reject the request with 401 unless the X-Ingest-Token header matches INGEST_TOKEN.

    If INGEST_TOKEN is not set (local development), every request is allowed.
    """
    if settings.ingest_token and x_ingest_token != settings.ingest_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest token")
