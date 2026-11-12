import asyncio
from types import SimpleNamespace

import fakeredis.aioredis
import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from linkhop.cache import Cache
from linkhop.config import Settings
from linkhop.main import create_app
from linkhop.models.db import Base
from linkhop.models.domain import ContentType, ResolvedContent, SearchHit
from linkhop.ratelimit import RateLimiter


class StubAdapter:
    def __init__(self, sid: str, resolve_value=None, search_value=None):
        self.service_id = sid
        self.capabilities = SimpleNamespace(
            track=True, album=True, artist=True, supports=lambda t: True,
        )
        self._resolve_value = resolve_value
        self._search_value = search_value or []

    async def resolve(self, parsed):
        return self._resolve_value

    async def search(self, meta, target_type):
        return self._search_value


@pytest.fixture
def patched_app(monkeypatch):
    app = create_app(Settings())

    async def _fake_startup():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
        app.state.engine = engine

        rc = fakeredis.aioredis.FakeRedis()
        app.state.redis = rc
        app.state.cache = Cache(rc, default_ttl=60)
        app.state.ratelimiter = RateLimiter(
            rc, anonymous_per_minute=1000, with_key_per_minute=1000,
        )

        source_meta = ResolvedContent(
            service="tidal", type=ContentType.TRACK, id="1",
            url="https://tidal.com/track/1", title="Nightcall",
            artists=("Kavinsky",), album="Outrun",
            duration_ms=257000, isrc="FR6V81200001", upc=None, artwork="",
        )
        app.state.adapters = {
            "tidal": StubAdapter("tidal", resolve_value=source_meta),
            "spotify": StubAdapter("spotify", search_value=[
                SearchHit(service="spotify", id="sp1",
                          url="https://open.spotify.com/track/sp1",
                          confidence=1.0, match="isrc"),
            ]),
            "deezer": StubAdapter("deezer", search_value=[]),
        }

    asyncio.run(_fake_startup())
    yield app
    asyncio.run(app.state.engine.dispose())


def test_convert_happy_path(patched_app):
    # Wichtig: KEIN `with`-Block um TestClient, sonst triggert FastAPI den
    # echten Lifespan, der `app.state.cache/adapters/session_factory` mit
    # echtem Redis/Postgres/httpx überschreibt und die Stubs aus
    # `_fake_startup` wegwirft.
    client = TestClient(patched_app)
    resp = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"]["title"] == "Nightcall"
    assert body["targets"]["spotify"]["status"] == "ok"
    assert body["targets"]["spotify"]["match"] == "isrc"
    assert body["targets"]["deezer"]["status"] == "not_found"
    assert body["cache"]["hit"] is False


def test_convert_returns_cached(patched_app):
    client = TestClient(patched_app)
    first = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"}).json()
    resp = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"})
    body = resp.json()
    assert body["cache"]["hit"] is True
    # Stärker als reine hit-Prüfung — fängt Bugs, bei denen der Cache-Pfad
    # zwar als Hit gemeldet wird, aber andere (z.B. leere) Payloads liefert.
    assert body["source"] == first["source"]
    assert body["targets"] == first["targets"]


def test_convert_unsupported_url_400(patched_app):
    client = TestClient(patched_app)
    resp = client.get("/api/v1/convert", params={"url": "https://example.com/foo"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "unsupported_service"


def test_convert_with_share_returns_short_id(patched_app):
    client = TestClient(patched_app)
    resp = client.get(
        "/api/v1/convert",
        params={"url": "https://tidal.com/track/1", "share": "true"},
    )
    body = resp.json()
    assert body["share"] is not None
    assert len(body["share"]["id"]) == 6
    # Prüfe Pfad-Form, damit Regressionen an scheme/host (leerer Host-Header,
    # fehlendes /c/-Prefix) nicht stumm den 6-Zeichen-Check passieren.
    # Public-Frontend-Route (ohne /api/v1/), nicht der API-Endpoint — der
    # Nutzer klickt den Link und erwartet eine gerenderte Seite.
    assert body["share"]["url"].endswith(f"/c/{body['share']['id']}")
    assert "/api/v1/c/" not in body["share"]["url"]


def test_convert_metadata_match_reports_what_was_matched(patched_app):
    patched_app.state.adapters["deezer"] = StubAdapter(
        "deezer",
        resolve_value=ResolvedContent(
            service="deezer", type=ContentType.TRACK, id="dz1",
            url="https://www.deezer.com/track/dz1", title="Nightcall (Live)",
            artists=("Kavinsky",), album=None,
            duration_ms=257000, isrc=None, upc=None, artwork="",
        ),
        search_value=[
            SearchHit(service="deezer", id="dz1", url="https://www.deezer.com/track/dz1",
                      confidence=0.0, match="metadata"),
        ],
    )
    client = TestClient(patched_app)
    body = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"}).json()
    assert body["targets"]["deezer"]["title"] == "Nightcall (Live)"
    assert body["targets"]["deezer"]["artists"] == ["Kavinsky"]
    assert body["targets"]["spotify"]["title"] is None


def test_convert_returns_the_preview_with_the_source(patched_app):
    patched_app.state.adapters["tidal"] = StubAdapter("tidal", resolve_value=ResolvedContent(
        service="tidal", type=ContentType.TRACK, id="1",
        url="https://tidal.com/track/1", title="Nightcall", artists=("Kavinsky",),
        album="Outrun", duration_ms=257000, isrc="FR6V81200001", upc=None, artwork="",
        preview_url="https://preview/x.m4a",
    ))
    client = TestClient(patched_app)
    body = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"}).json()
    assert body["source"]["preview_url"] == "https://preview/x.m4a"


def test_convert_returns_the_album_link_of_a_track(patched_app):
    patched_app.state.adapters["tidal"] = StubAdapter("tidal", resolve_value=ResolvedContent(
        service="tidal", type=ContentType.TRACK, id="1",
        url="https://tidal.com/track/1", title="Nightcall", artists=("Kavinsky",),
        album="Outrun", duration_ms=257000, isrc="FR6V81200001", upc=None, artwork="",
        album_url="https://tidal.com/album/17927863",
    ))
    client = TestClient(patched_app)
    body = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"}).json()
    assert body["source"]["album_url"] == "https://tidal.com/album/17927863"


@respx.mock
def test_convert_expands_a_short_link_first(patched_app):
    patched_app.state.http = httpx.AsyncClient()
    route = respx.get("https://link.deezer.com/s/30abc").respond(
        302, headers={"location": "https://tidal.com/track/1"}
    )
    client = TestClient(patched_app)
    resp = client.get(
        "/api/v1/convert", params={"url": "https://link.deezer.com/s/30abc", "share": "true"},
    )
    assert resp.status_code == 400  # tidal.com is not a hop a short link may take
    route.respond(302, headers={"location": "https://www.deezer.com/track/1"})
    patched_app.state.adapters["deezer"] = patched_app.state.adapters["tidal"]
    resp = client.get(
        "/api/v1/convert", params={"url": "https://link.deezer.com/s/30abc", "share": "true"},
    )
    assert resp.status_code == 200
    assert resp.json()["source"]["title"] == "Nightcall"
    resp = client.get("/api/v1/convert", params={"url": "https://link.deezer.com/s/30abc"})
    assert resp.status_code == 200
    assert route.call_count == 2
