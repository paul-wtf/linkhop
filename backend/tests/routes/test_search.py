import fakeredis.aioredis
import pytest
from fastapi.testclient import TestClient

from linkhop.adapters.base import AdapterError
from linkhop.cache import Cache
from linkhop.config import Settings
from linkhop.main import create_app
from linkhop.models.domain import ContentType, ResolvedContent
from linkhop.ratelimit import RateLimiter


class SearchingAdapter:
    def __init__(self, service_id: str):
        self.service_id = service_id
        self.queries: list[str] = []

    async def text_search(self, query: str) -> list[ResolvedContent]:
        self.queries.append(query)
        return [ResolvedContent(
            service=self.service_id, type=ContentType.TRACK, id="1",
            url=f"https://{self.service_id}/track/1", title="Nightcall",
            artists=("Kavinsky",), album="OutRun", duration_ms=None,
            isrc=None, upc=None, artwork="https://covers/a.jpg",
        )]


@pytest.fixture
def app():
    app = create_app(Settings())
    rc = fakeredis.aioredis.FakeRedis()
    app.state.redis = rc
    app.state.cache = Cache(rc, default_ttl=60)
    app.state.ratelimiter = RateLimiter(rc, anonymous_per_minute=1000, with_key_per_minute=1000)
    app.state.adapters = {}
    return app


def test_search_asks_deezer_first(app):
    deezer, apple = SearchingAdapter("deezer"), SearchingAdapter("apple_music")
    app.state.adapters = {"apple_music": apple, "deezer": deezer}
    resp = TestClient(app).get("/api/v1/search", params={"q": "  kavinsky nightcall "})
    assert resp.status_code == 200
    assert resp.json()["results"] == [{
        "service": "deezer", "type": "track", "url": "https://deezer/track/1",
        "title": "Nightcall", "artists": ["Kavinsky"], "album": "OutRun",
        "artwork": "https://covers/a.jpg",
    }]
    assert deezer.queries == ["kavinsky nightcall"]
    assert apple.queries == []


def test_search_falls_back_to_apple_music(app):
    apple = SearchingAdapter("apple_music")
    app.state.adapters = {"apple_music": apple, "spotify": object()}
    resp = TestClient(app).get("/api/v1/search", params={"q": "kavinsky"})
    assert resp.json()["results"][0]["service"] == "apple_music"


def test_search_is_cached(app):
    deezer = SearchingAdapter("deezer")
    app.state.adapters = {"deezer": deezer}
    client = TestClient(app)
    client.get("/api/v1/search", params={"q": "Kavinsky"})
    client.get("/api/v1/search", params={"q": "kavinsky"})
    assert len(deezer.queries) == 1


def test_search_without_a_searchable_service_is_unavailable(app):
    app.state.adapters = {"spotify": object()}
    resp = TestClient(app).get("/api/v1/search", params={"q": "kavinsky"})
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "search_unavailable"


def test_search_needs_at_least_two_characters(app):
    resp = TestClient(app).get("/api/v1/search", params={"q": "k"})
    assert resp.status_code == 422


def test_search_reports_a_failing_service_as_bad_gateway(app):
    class Failing(SearchingAdapter):
        async def text_search(self, query: str):
            raise AdapterError("deezer", "GET /search/track: 500")

    app.state.adapters = {"deezer": Failing("deezer")}
    resp = TestClient(app).get("/api/v1/search", params={"q": "kavinsky"})
    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "search_failed"
