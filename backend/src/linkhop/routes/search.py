from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from linkhop.adapters.base import AdapterError
from linkhop.cache import Cache
from linkhop.errors import AppError
from linkhop.middleware import enforce_rate_limit
from linkhop.models.api import SearchResponse, SearchResult

router = APIRouter(prefix="/api/v1", tags=["search"])

# Both search without credentials. Deezer first: its results carry ISRC-backed
# ids, so the conversion that follows matches by identifier.
_SEARCHABLE = ("deezer", "apple_music")
_CACHE_TTL_SECONDS = 3600


@router.get("/search", response_model=SearchResponse)
async def search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=100, description="Title, artist or album"),
    _rl=Depends(enforce_rate_limit),
) -> SearchResponse:
    query = " ".join(q.split())
    adapters = request.app.state.adapters
    adapter = next(
        (adapters[sid] for sid in _SEARCHABLE if hasattr(adapters.get(sid), "text_search")),
        None,
    )
    if adapter is None:
        raise AppError(
            code="search_unavailable", status=503,
            message="no enabled service can search by text",
        )

    cache: Cache = request.app.state.cache
    key = f"search:{adapter.service_id}:{query.lower()}"
    cached = await cache.get(key)
    if cached is not None:
        return SearchResponse(results=[SearchResult(**item) for item in cached])

    try:
        hits = await adapter.text_search(query)
    except AdapterError as e:
        raise AppError(code="search_failed", status=502, message=str(e)) from e
    results = [
        SearchResult(
            service=hit.service, type=hit.type.value, url=hit.url, title=hit.title,
            artists=list(hit.artists), album=hit.album, artwork=hit.artwork,
        )
        for hit in hits
    ]
    await cache.set(key, [r.model_dump(mode="json") for r in results], ttl=_CACHE_TTL_SECONDS)
    return SearchResponse(results=results)
