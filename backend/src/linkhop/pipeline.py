from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from typing import Literal

from linkhop.adapters.base import AdapterError, ServiceAdapter
from linkhop.errors import SourceNotFoundError
from linkhop.matching import score_candidate, threshold_status
from linkhop.models.domain import ContentType, MatchType, ResolvedContent, SearchHit
from linkhop.url_parser import ParsedUrl

TargetStatus = Literal["ok", "ok_low", "not_found", "error"]


@dataclass(slots=True)
class TargetOutcome:
    status: TargetStatus
    url: str | None = None
    confidence: float | None = None
    match: MatchType | None = None
    message: str | None = None
    title: str | None = None
    artists: tuple[str, ...] | None = None
    preview_url: str | None = None


@dataclass(slots=True)
class ConvertOutcome:
    source: ResolvedContent
    targets: dict[str, TargetOutcome]
    preview_url: str | None = None


class Pipeline:
    def __init__(self, adapters: dict[str, ServiceAdapter]) -> None:
        self._adapters = adapters

    async def resolve_source(self, parsed: ParsedUrl) -> ResolvedContent:
        source_adapter = self._adapters.get(parsed.service)
        if source_adapter is None:
            raise SourceNotFoundError(f"no adapter for source service: {parsed.service}")

        source = await source_adapter.resolve(parsed)
        if source is None:
            raise SourceNotFoundError(
                f"source not found: {parsed.service}/{parsed.type}/{parsed.id}"
            )
        return source

    def target_ids(self, parsed: ParsedUrl) -> list[str]:
        return [sid for sid in self._adapters if sid != parsed.service]

    async def search_targets(
        self, source: ResolvedContent, parsed: ParsedUrl
    ) -> AsyncIterator[tuple[str, TargetOutcome]]:
        type_ = ContentType(parsed.type)

        async def one(sid: str) -> tuple[str, TargetOutcome]:
            return sid, await self._search_one(sid, source, type_)

        tasks = [asyncio.ensure_future(one(sid)) for sid in self.target_ids(parsed)]
        try:
            for finished in asyncio.as_completed(tasks):
                yield await finished
        finally:
            for task in tasks:
                task.cancel()

    @staticmethod
    def preview_url(source: ResolvedContent, targets: Iterable[TargetOutcome]) -> str | None:
        return source.preview_url or next(
            (t.preview_url for t in targets if t.status == "ok" and t.preview_url), None
        )

    async def convert(self, parsed: ParsedUrl) -> ConvertOutcome:
        source = await self.resolve_source(parsed)
        found = {sid: outcome async for sid, outcome in self.search_targets(source, parsed)}
        targets = {sid: found[sid] for sid in self.target_ids(parsed)}
        return ConvertOutcome(
            source=source, targets=targets,
            preview_url=self.preview_url(source, targets.values()),
        )

    async def _search_one(
        self, service_id: str, source: ResolvedContent, type_: ContentType
    ) -> TargetOutcome:
        adapter = self._adapters[service_id]
        try:
            hits: list[SearchHit] = await adapter.search(source, type_)
        except AdapterError as e:
            return TargetOutcome(status="error", message=e.message)
        except Exception as e:  # defensive, unknown adapter bug
            return TargetOutcome(status="error", message=f"unexpected: {e}")

        if not hits:
            return TargetOutcome(status="not_found")

        id_hits = [h for h in hits if h.match in {"isrc", "upc"}]
        if id_hits:
            id_best = id_hits[0]
            return TargetOutcome(
                status="ok", url=id_best.url, confidence=1.0, match=id_best.match,
                preview_url=id_best.preview_url,
            )

        best: SearchHit | None = None
        best_meta: ResolvedContent | None = None
        best_score = 0.0
        for h in hits:
            full = await self._resolve_hit(service_id, h, type_)
            if full is None:
                continue
            score = score_candidate(source, full, match="metadata")
            if score > best_score:
                best, best_meta, best_score = h, full, score

        status = threshold_status(best_score)
        if status == "not_found" or best is None or best_meta is None:
            return TargetOutcome(status="not_found")
        # "ok" or "ok_low" — preserve the bucket so the UI can show a "~match" badge.
        return TargetOutcome(
            status=status, url=best.url,
            confidence=round(best_score, 3), match="metadata",
            title=best_meta.title, artists=best_meta.artists,
            preview_url=best.preview_url or best_meta.preview_url,
        )

    async def _resolve_hit(
        self, service_id: str, hit: SearchHit, type_: ContentType
    ) -> ResolvedContent | None:
        adapter = self._adapters[service_id]
        try:
            return await adapter.resolve(
                ParsedUrl(service=service_id, type=type_.value, id=hit.id)
            )
        except Exception:
            # A failure fetching the candidate's full metadata must not kill the whole
            # convert call — just drop this hit out of scoring.
            return None
