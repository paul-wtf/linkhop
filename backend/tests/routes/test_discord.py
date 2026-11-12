import json

import httpx
import respx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

from linkhop.config import Settings
from tests.routes.test_convert import patched_app  # noqa: F401

KEY = Ed25519PrivateKey.generate()
PUBLIC_HEX = KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
FOLLOW_UP = "https://discord.com/api/v10/webhooks/app1/tok1/messages/@original"


def configure(app):
    app.state.settings = Settings(discord_public_key=PUBLIC_HEX)
    app.state.http = httpx.AsyncClient()
    return TestClient(app)


def post(client: TestClient, payload: dict, *, key=KEY, timestamp="1700000000"):
    body = json.dumps(payload).encode()
    signature = key.sign(timestamp.encode() + body).hex()
    return client.post(
        "/api/v1/discord/interactions",
        content=body,
        headers={
            "X-Signature-Ed25519": signature,
            "X-Signature-Timestamp": timestamp,
            "Content-Type": "application/json",
        },
    )


def command(data: dict) -> dict:
    return {"type": 2, "application_id": "app1", "token": "tok1", "locale": "de", "data": data}


def test_interactions_are_off_without_a_public_key(patched_app):  # noqa: F811
    resp = post(TestClient(patched_app), {"type": 1})
    assert resp.status_code == 404


def test_ping_is_answered(patched_app):  # noqa: F811
    resp = post(configure(patched_app), {"type": 1})
    assert resp.status_code == 200
    assert resp.json() == {"type": 1}


def test_a_request_signed_by_someone_else_is_refused(patched_app):  # noqa: F811
    resp = post(configure(patched_app), {"type": 1}, key=Ed25519PrivateKey.generate())
    assert resp.status_code == 401


def test_a_request_without_signature_is_refused(patched_app):  # noqa: F811
    resp = configure(patched_app).post("/api/v1/discord/interactions", json={"type": 1})
    assert resp.status_code == 401


@respx.mock
def test_slash_command_defers_and_then_posts_the_links(patched_app):  # noqa: F811
    follow_up = respx.patch(FOLLOW_UP).respond(json={})
    resp = post(configure(patched_app), command({
        "type": 1, "name": "linkhop",
        "options": [{"name": "link", "type": 3, "value": "https://tidal.com/track/1"}],
    }))
    assert resp.json() == {"type": 5}
    assert follow_up.call_count == 1
    embed = json.loads(follow_up.calls.last.request.content)["embeds"][0]
    assert embed["title"] == "Nightcall · Kavinsky"
    assert "[Tidal](https://tidal.com/track/1)" in embed["description"]
    assert "[Spotify](https://open.spotify.com/track/sp1)" in embed["description"]
    assert "Deezer" not in embed["description"]


@respx.mock
def test_message_command_converts_the_first_link_in_the_message(patched_app):  # noqa: F811
    follow_up = respx.patch(FOLLOW_UP).respond(json={})
    resp = post(configure(patched_app), command({
        "type": 3, "name": "linkhop", "target_id": "m1",
        "resolved": {"messages": {"m1": {
            "content": "hört mal rein: https://tidal.com/track/1 und https://example.com/x",
        }}},
    }))
    assert resp.json() == {"type": 5}
    embed = json.loads(follow_up.calls.last.request.content)["embeds"][0]
    assert embed["title"] == "Nightcall · Kavinsky"


@respx.mock
def test_message_without_a_link_gets_a_plain_answer(patched_app):  # noqa: F811
    follow_up = respx.patch(FOLLOW_UP).respond(json={})
    post(configure(patched_app), command({
        "type": 3, "name": "linkhop", "target_id": "m1",
        "resolved": {"messages": {"m1": {"content": "kein link hier"}}},
    }))
    body = json.loads(follow_up.calls.last.request.content)
    assert "embeds" not in body
    assert body["content"] == "In dieser Nachricht steht kein Musik-Link."


@respx.mock
def test_an_unsupported_link_gets_a_plain_answer_in_the_callers_language(patched_app):  # noqa: F811
    follow_up = respx.patch(FOLLOW_UP).respond(json={})
    payload = command({
        "type": 1, "name": "linkhop",
        "options": [{"name": "link", "type": 3, "value": "https://example.com/x"}],
    })
    payload["locale"] = "en-US"
    post(configure(patched_app), payload)
    body = json.loads(follow_up.calls.last.request.content)
    assert body["content"] == "linkhop does not know this link."
