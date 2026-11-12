from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from linkhop.cache import Cache
from linkhop.middleware import enforce_rate_limit
from linkhop.models.api import (
    CacheInfo,
    ConvertResponse,
    ShareInfo,
    SourceContent,
    TargetResult,
)
from linkhop.models.domain import ResolvedContent
from linkhop.pipeline import Pipeline, TargetOutcome
from linkhop.short_id import ShortIdService
from linkhop.short_links import expand, is_short_link
from linkhop.url_parser import ParsedUrl, parse

router = APIRouter(prefix="/api/v1", tags=["convert"])


async def _parse(request: Request, url: str) -> tuple[ParsedUrl, str]:
    cache: Cache = request.app.state.cache
    if is_short_link(url):
        short_key = f"short:{url}"
        expanded = await cache.get(short_key)
        if expanded is None:
            expanded = await expand(url, request.app.state.http)
            await cache.set(short_key, expanded)
        url = expanded
    return parse(url), url


def _source_model(source: ResolvedContent, preview_url: str | None) -> SourceContent:
    return SourceContent(
        service=source.service,
        type=source.type.value,
        id=source.id,
        url=source.url,
        title=source.title,
        artists=list(source.artists),
        album=source.album,
        duration_ms=source.duration_ms,
        isrc=source.isrc,
        upc=source.upc,
        artwork=source.artwork,
        preview_url=preview_url,
        album_url=source.album_url,
    )


def _target_model(t: TargetOutcome) -> TargetResult:
    return TargetResult(
        status=t.status, url=t.url, confidence=t.confidence,
        match=t.match, message=t.message,
        title=t.title, artists=list(t.artists) if t.artists is not None else None,
    )


async def _cached(
    cache: Cache, key: str
) -> tuple[SourceContent, dict[str, TargetResult], CacheInfo] | None:
    cached = await cache.get(key)
    if cached is None:
        return None
    # Redis TTL returns -2 when the key just expired between get and ttl
    # (and -1 when no TTL is set). Neither is a meaningful number to leak
    # to API clients, so clamp to 0.
    return (
        SourceContent(**cached["source"]),
        {k: TargetResult(**v) for k, v in cached["targets"].items()},
        CacheInfo(hit=True, ttl_seconds=max(0, await cache.ttl(key))),
    )


async def _store(
    cache: Cache, key: str, source: SourceContent, targets: dict[str, TargetResult]
) -> None:
    await cache.set(key, {
        "source": source.model_dump(mode="json"),
        "targets": {k: v.model_dump(mode="json") for k, v in targets.items()},
    })


def _sse(event: str, data: BaseModel | dict[str, Any]) -> str:
    body = data.model_dump_json() if isinstance(data, BaseModel) else json.dumps(data)
    return f"event: {event}\ndata: {body}\n\n"


@router.get("/convert/stream", response_class=StreamingResponse)
async def convert_stream(
    request: Request,
    url: str = Query(..., description="Music-service URL"),
    _rl=Depends(enforce_rate_limit),
) -> StreamingResponse:
    """Server-sent events: `source`, one `target` per service as it answers, then
    `done` with the same body as `/convert`."""
    parsed, url = await _parse(request, url)
    cache: Cache = request.app.state.cache
    adapters = request.app.state.adapters
    cache_key = Cache.convert_key(adapters.keys(), parsed.service, parsed.type, parsed.id)
    cached = await _cached(cache, cache_key)
    pipeline = Pipeline(adapters)
    # Resolved before the response starts, so an unknown source is still a
    # plain 404 and not an event inside a 200.
    source = None if cached else await pipeline.resolve_source(parsed)
    fresh_ttl = request.app.state.settings.cache_ttl_seconds

    async def events() -> AsyncIterator[str]:
        if cached is not None:
            source_model, targets, cache_info = cached
            yield _sse("source", {
                "source": source_model.model_dump(mode="json"), "pending": list(targets),
            })
            for sid, target in targets.items():
                yield _sse("target", {"service": sid, "result": target.model_dump(mode="json")})
            yield _sse("done", ConvertResponse(
                source=source_model, targets=targets, cache=cache_info,
            ))
            return

        assert source is not None
        pending = pipeline.target_ids(parsed)
        yield _sse("source", {
            "source": _source_model(source, source.preview_url).model_dump(mode="json"),
            "pending": pending,
        })
        outcomes: dict[str, TargetOutcome] = {}
        async for sid, outcome in pipeline.search_targets(source, parsed):
            outcomes[sid] = outcome
            yield _sse("target", {
                "service": sid, "result": _target_model(outcome).model_dump(mode="json"),
            })
        ordered = {sid: outcomes[sid] for sid in pending}
        source_model = _source_model(source, pipeline.preview_url(source, ordered.values()))
        targets = {sid: _target_model(t) for sid, t in ordered.items()}
        await _store(cache, cache_key, source_model, targets)
        yield _sse("done", ConvertResponse(
            source=source_model, targets=targets,
            cache=CacheInfo(hit=False, ttl_seconds=fresh_ttl),
        ))

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        # X-Accel-Buffering: nginx-style proxies hold a response back until it
        # is complete unless told otherwise.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/convert", response_model=ConvertResponse)
async def convert(
    request: Request,
    url: str = Query(..., description="Music-service URL"),
    targets: str | None = Query(None, description="Comma-separated list of target service ids"),
    share: bool = Query(False, description="If true, produce a share short-id"),
    _rl=Depends(enforce_rate_limit),
) -> ConvertResponse:
    parsed, url = await _parse(request, url)
    cache: Cache = request.app.state.cache
    adapters = request.app.state.adapters
    cache_key = Cache.convert_key(adapters.keys(), parsed.service, parsed.type, parsed.id)

    cached = await _cached(cache, cache_key)
    if cached is not None:
        source_model, targets_dict, cache_info = cached
    else:
        outcome = await Pipeline(adapters).convert(parsed)
        source_model = _source_model(outcome.source, outcome.preview_url)
        targets_dict = {sid: _target_model(t) for sid, t in outcome.targets.items()}
        await _store(cache, cache_key, source_model, targets_dict)
        cache_info = CacheInfo(hit=False, ttl_seconds=request.app.state.settings.cache_ttl_seconds)

    if targets:
        wanted = {t.strip() for t in targets.split(",") if t.strip()}
        targets_dict = {k: v for k, v in targets_dict.items() if k in wanted}

    share_info: ShareInfo | None = None
    if share:
        session_factory = request.app.state.session_factory
        async with session_factory() as session:
            svc = ShortIdService(session)
            sid = await svc.get_or_create(
                source_service=parsed.service,
                source_type=parsed.type,
                source_id=parsed.id,
                source_url=url,
            )
        host = request.headers.get("host", "")
        scheme = request.url.scheme
        # Public-facing Frontend-Route, nicht der API-Endpoint: Der User klickt
        # den Link, erwartet eine gerenderte Ergebnisseite — nicht das JSON.
        # Frontend lädt /c/{sid} und ruft intern /api/v1/c/{sid} für die Daten.
        share_info = ShareInfo(id=sid, url=f"{scheme}://{host}/c/{sid}")

    return ConvertResponse(
        source=source_model,
        targets=targets_dict,
        cache=cache_info,
        share=share_info,
    )
