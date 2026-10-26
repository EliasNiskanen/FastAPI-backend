"""Dependencies shared by the stock and crypto routers."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status

from app.config import Settings, get_settings

Limit = Annotated[int, Query(ge=1, le=5000, description="How many latest bars to return")]


def require_ingest_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_ingest_token: Annotated[str | None, Header()] = None,
) -> None:
    if settings.ingest_token and x_ingest_token != settings.ingest_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ingest token")
