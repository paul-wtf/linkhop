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

FRONTEND = "http://frontend.test"
INDEX = (
    "<!doctype html><html><head><title>linkhop</title>"
    '<meta name="viewport" content="width=device-width" /></head>'
    '<body><div id="app"></div></body></html>'
)


class StubAdapter:
    def __init__(self, sid: str, resolve_value=None, search_value=None):
        self.service_id = sid
        self.capabilities = SimpleNamespace(
            track=True, album=True, artist=True, supports=lambda t: True,
        )
        self._r = resolve_value
        self._s = search_value or []

    async def resolve(self, parsed): return self._r
    async def search(self, meta, t): return self._s


@pytest.fixture
def app():
    app = create_app(Settings(frontend_url=FRONTEND))

    async def _startup():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        app.state.engine = engine
        app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
        rc = fakeredis.aioredis.FakeRedis()
        app.state.redis = rc
        app.state.cache = Cache(rc, default_ttl=60)
        app.state.ratelimiter = RateLimiter(
            rc, anonymous_per_minute=1000, with_key_per_minute=1000,
        )
        app.state.http = httpx.AsyncClient()
        app.state.adapters = {
            "tidal": StubAdapter("tidal", resolve_value=ResolvedContent(
                service="tidal", type=ContentType.TRACK, id="1",
                url="https://tidal.com/track/1", title='Say "Hi" <now>',
                artists=("Kavinsky", "Lovefoxxx"), album="Outrun", duration_ms=200000,
                isrc=None, upc=None, artwork="https://covers.test/a.jpg?x=1&y=2",
            )),
            "spotify": StubAdapter("spotify", search_value=[
                SearchHit(service="spotify", id="sp1",
                          url="https://open.spotify.com/track/sp1",
                          confidence=1.0, match="isrc"),
            ]),
        }

    asyncio.run(_startup())
    return app


def share(client: TestClient) -> str:
    return client.get(
        "/api/v1/convert", params={"url": "https://tidal.com/track/1", "share": "true"},
    ).json()["share"]["id"]


@respx.mock
def test_share_page_is_the_frontend_shell_with_preview_tags(app):
    respx.get(f"{FRONTEND}/index.html").respond(text=INDEX)
    client = TestClient(app)
    sid = share(client)
    resp = client.get(f"/c/{sid}", headers={"host": "linkhop.example"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    html = resp.text
    assert '<div id="app"></div>' in html
    title = "Say &quot;Hi&quot; &lt;now&gt; · Kavinsky, Lovefoxxx"
    assert f"<title>{title} · linkhop</title>" in html
    assert f'<meta property="og:title" content="{title}" />' in html
    assert '<meta property="og:image" content="https://covers.test/a.jpg?x=1&amp;y=2" />' in html
    assert '<meta property="og:type" content="music.song" />' in html
    assert f'<meta property="og:url" content="http://linkhop.example/c/{sid}" />' in html
    assert '<meta property="og:description" content="Tidal · Spotify" />' in html
    assert html.index("og:title") < html.index("</head>")


@respx.mock
def test_share_page_does_not_count_as_an_open(app):
    respx.get(f"{FRONTEND}/index.html").respond(text=INDEX)
    client = TestClient(app)
    sid = share(client)
    client.get(f"/c/{sid}")
    client.get(f"/c/{sid}")
    assert client.get(f"/api/v1/c/{sid}").json()["opens"] == 1


@respx.mock
def test_share_page_for_an_unknown_id_is_the_plain_shell(app):
    respx.get(f"{FRONTEND}/index.html").respond(text=INDEX)
    resp = TestClient(app).get("/c/nothere")
    assert resp.status_code == 404
    assert '<div id="app"></div>' in resp.text
    assert "og:title" not in resp.text


@respx.mock
def test_share_page_fetches_the_shell_once_while_it_is_fresh(app):
    route = respx.get(f"{FRONTEND}/index.html").respond(text=INDEX)
    client = TestClient(app)
    sid = share(client)
    client.get(f"/c/{sid}")
    client.get(f"/c/{sid}")
    assert route.call_count == 1


@respx.mock
def test_share_page_without_a_reachable_frontend_still_previews_and_forwards(app):
    respx.get(f"{FRONTEND}/index.html").respond(status_code=502)
    client = TestClient(app)
    sid = share(client)
    resp = client.get(f"/c/{sid}")
    assert resp.status_code == 200
    assert 'property="og:title"' in resp.text
    assert "/?url=https%3A%2F%2Ftidal.com%2Ftrack%2F1" in resp.text
