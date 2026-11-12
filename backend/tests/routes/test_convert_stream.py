import json

from fastapi.testclient import TestClient

from linkhop.adapters.base import AdapterError
from tests.routes.test_convert import StubAdapter, patched_app  # noqa: F401


def events(text: str) -> list[tuple[str, dict]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_stream_sends_source_then_each_target_then_the_whole_result(patched_app):  # noqa: F811
    client = TestClient(patched_app)
    resp = client.get("/api/v1/convert/stream", params={"url": "https://tidal.com/track/1"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    got = events(resp.text)
    assert [name for name, _ in got] == ["source", "target", "target", "done"]
    assert got[0][1]["source"]["title"] == "Nightcall"
    assert got[0][1]["pending"] == ["spotify", "deezer"]
    targets = {data["service"]: data["result"]["status"] for name, data in got if name == "target"}
    assert targets == {"spotify": "ok", "deezer": "not_found"}
    done = got[-1][1]
    assert done["cache"]["hit"] is False
    assert list(done["targets"]) == ["spotify", "deezer"]
    plain = client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"}).json()
    assert plain["cache"]["hit"] is True
    assert plain["targets"] == done["targets"]


def test_stream_of_a_cached_conversion_replays_it(patched_app):  # noqa: F811
    client = TestClient(patched_app)
    client.get("/api/v1/convert", params={"url": "https://tidal.com/track/1"})
    got = events(
        client.get("/api/v1/convert/stream", params={"url": "https://tidal.com/track/1"}).text
    )
    assert [name for name, _ in got] == ["source", "target", "target", "done"]
    assert got[-1][1]["cache"]["hit"] is True


def test_stream_reports_a_failing_service_as_its_target(patched_app):  # noqa: F811
    class Broken(StubAdapter):
        async def search(self, meta, t):
            raise AdapterError("deezer", "boom")

    patched_app.state.adapters["deezer"] = Broken("deezer")
    got = events(
        TestClient(patched_app)
        .get("/api/v1/convert/stream", params={"url": "https://tidal.com/track/1"}).text
    )
    deezer = next(d for n, d in got if n == "target" and d["service"] == "deezer")
    assert deezer["result"]["status"] == "error"


def test_stream_rejects_an_unsupported_link_before_it_starts(patched_app):  # noqa: F811
    resp = TestClient(patched_app).get(
        "/api/v1/convert/stream", params={"url": "https://example.com/x"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "unsupported_service"


def test_stream_reports_a_missing_source_before_it_starts(patched_app):  # noqa: F811
    patched_app.state.adapters["tidal"] = StubAdapter("tidal", resolve_value=None)
    resp = TestClient(patched_app).get(
        "/api/v1/convert/stream", params={"url": "https://tidal.com/track/1"}
    )
    assert resp.status_code == 404
