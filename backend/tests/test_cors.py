from fastapi.testclient import TestClient

from linkhop.config import Settings
from linkhop.main import create_app


def get(origins: list[str], origin: str):
    client = TestClient(create_app(Settings(cors_allow_origins=origins)))
    return client.get("/api/v1/openapi.json", headers={"Origin": origin})


def test_any_origin_may_read_by_default():
    resp = TestClient(create_app(Settings())).get(
        "/api/v1/openapi.json", headers={"Origin": "https://paul.wtf"}
    )
    assert resp.headers["access-control-allow-origin"] == "*"


def test_a_listed_origin_may_read():
    resp = get(["https://linkhop.example", "https://paul.wtf"], "https://paul.wtf")
    assert resp.headers["access-control-allow-origin"] == "https://paul.wtf"


def test_an_unlisted_origin_gets_no_cors_header():
    resp = get(["https://linkhop.example"], "https://evil.example")
    assert "access-control-allow-origin" not in resp.headers


def test_preflight_allows_get_only():
    client = TestClient(create_app(Settings(cors_allow_origins=["https://paul.wtf"])))
    resp = client.options(
        "/api/v1/convert",
        headers={"Origin": "https://paul.wtf", "Access-Control-Request-Method": "GET"},
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-methods"] == "GET"
