from __future__ import annotations

import json
import logging
import re
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, BackgroundTasks, Request

from linkhop.errors import AppError, SourceNotFoundError
from linkhop.models.api import ConvertResponse
from linkhop.routes.convert import convert as convert_view
from linkhop.routes.services import service_name
from linkhop.url_parser import UnsupportedUrlError

router = APIRouter(prefix="/api/v1/discord", tags=["discord"])
log = logging.getLogger(__name__)

_API = "https://discord.com/api/v10"
_PING, _APPLICATION_COMMAND = 1, 2
_PONG, _DEFERRED_MESSAGE = 1, 5
_MESSAGE_COMMAND = 3
_ACCENT = 0x89B4FA
_LINK = re.compile(r"https?://\S+")

_TEXTS = {
    "de": {
        "no_link": "In dieser Nachricht steht kein Musik-Link.",
        "unsupported": "linkhop kennt diesen Link nicht.",
        "not_found": "Zu diesem Link wurde nichts gefunden.",
        "failed": "Die Konvertierung ist fehlgeschlagen.",
    },
    "en": {
        "no_link": "There is no music link in this message.",
        "unsupported": "linkhop does not know this link.",
        "not_found": "Nothing was found for this link.",
        "failed": "The conversion failed.",
    },
}

COMMANDS: list[dict[str, Any]] = [
    {
        "type": 1,
        "name": "linkhop",
        "description": "Find a music link on the other streaming services",
        "description_localizations": {"de": "Einen Musik-Link bei den anderen Diensten finden"},
        "options": [{
            "type": 3, "name": "link", "required": True,
            "description": "Link to a track, album or artist",
            "description_localizations": {"de": "Link zu einem Titel, Album oder Künstler"},
        }],
    },
    {"type": _MESSAGE_COMMAND, "name": "linkhop"},
]


def _verify(public_key_hex: str, signature_hex: str, timestamp: str, body: bytes) -> bool:
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(signature_hex), timestamp.encode() + body)
    except (InvalidSignature, ValueError):
        return False
    return True


def _link_of(data: dict[str, Any]) -> str | None:
    if data.get("type") == _MESSAGE_COMMAND:
        message = data.get("resolved", {}).get("messages", {}).get(data.get("target_id"), {})
        found = _LINK.search(message.get("content", ""))
        return found.group(0) if found else None
    options = data.get("options") or []
    return options[0].get("value") if options else None


def _embed(conversion: ConvertResponse) -> dict[str, Any]:
    source = conversion.source
    lines = [f"[{service_name(source.service)}]({source.url})"]
    for sid, target in conversion.targets.items():
        if target.status in {"ok", "ok_low"} and target.url:
            hint = " (~)" if target.status == "ok_low" else ""
            lines.append(f"[{service_name(sid)}]({target.url}){hint}")
    embed: dict[str, Any] = {
        "title": " · ".join(filter(None, [source.title, ", ".join(source.artists)])),
        "url": source.url,
        "description": "\n".join(lines),
        "color": _ACCENT,
    }
    if source.artwork:
        embed["thumbnail"] = {"url": source.artwork}
    return embed


async def _answer(request: Request, payload: dict[str, Any]) -> None:
    texts = _TEXTS["de" if payload.get("locale", "").startswith("de") else "en"]
    link = _link_of(payload.get("data", {}))
    message: dict[str, Any]
    if link is None:
        message = {"content": texts["no_link"]}
    else:
        try:
            conversion = await convert_view(request, url=link, targets=None, share=False)
            message = {"embeds": [_embed(conversion)]}
        except UnsupportedUrlError:
            message = {"content": texts["unsupported"]}
        except SourceNotFoundError:
            message = {"content": texts["not_found"]}
        except Exception:
            log.exception("discord conversion failed")
            message = {"content": texts["failed"]}
    url = f"{_API}/webhooks/{payload['application_id']}/{payload['token']}/messages/@original"
    try:
        resp = await request.app.state.http.patch(url, json=message)
        resp.raise_for_status()
    except Exception:
        log.exception("discord follow-up failed")


@router.post("/interactions", include_in_schema=False)
async def interactions(request: Request, background: BackgroundTasks) -> dict[str, int]:
    public_key = request.app.state.settings.discord_public_key
    if not public_key:
        raise AppError(code="not_found", status=404, message="discord commands are not enabled")
    body = await request.body()
    if not _verify(
        public_key,
        request.headers.get("X-Signature-Ed25519", ""),
        request.headers.get("X-Signature-Timestamp", ""),
        body,
    ):
        raise AppError(code="invalid_signature", status=401, message="invalid request signature")

    payload = json.loads(body)
    if payload.get("type") == _PING:
        return {"type": _PONG}
    if payload.get("type") == _APPLICATION_COMMAND:
        # Discord wants an answer within three seconds, a fresh conversion can
        # take longer: acknowledge now, edit the answer in when it is ready.
        background.add_task(_answer, request, payload)
        return {"type": _DEFERRED_MESSAGE}
    raise AppError(code="unsupported_interaction", status=400, message="unsupported interaction")
