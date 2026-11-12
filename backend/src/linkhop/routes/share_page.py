from __future__ import annotations

import time
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from linkhop.models.api import ConvertResponse
from linkhop.routes.convert import convert as convert_view
from linkhop.routes.services import service_name
from linkhop.short_id import ShortIdService

router = APIRouter(tags=["share"])

_SHELL_TTL_SECONDS = 60
_OG_TYPES = {"track": "music.song", "album": "music.album", "artist": "profile"}


async def _frontend_shell(request: Request) -> str | None:
    cached: tuple[float, str] | None = getattr(request.app.state, "frontend_shell", None)
    if cached is not None and time.monotonic() - cached[0] < _SHELL_TTL_SECONDS:
        return cached[1]
    base = request.app.state.settings.frontend_url.rstrip("/")
    try:
        resp = await request.app.state.http.get(f"{base}/index.html")
        resp.raise_for_status()
    except Exception:
        # A stale shell still boots the app; no shell at all means the fallback page.
        return cached[1] if cached is not None else None
    request.app.state.frontend_shell = (time.monotonic(), resp.text)
    return resp.text


def _preview_tags(conversion: ConvertResponse, page_url: str) -> tuple[str, str]:
    source = conversion.source
    title = " · ".join(filter(None, [source.title, ", ".join(source.artists)]))
    services = [source.service, *(
        sid for sid, target in conversion.targets.items()
        if target.status in {"ok", "ok_low"}
    )]
    tags = {
        "og:site_name": "linkhop",
        "og:type": _OG_TYPES[source.type],
        "og:title": title,
        "og:description": " · ".join(service_name(sid) for sid in services),
        "og:url": page_url,
    }
    if source.artwork:
        tags["og:image"] = source.artwork
    html = "".join(
        f'<meta property="{name}" content="{escape(value, quote=True)}" />'
        for name, value in tags.items()
    )
    html += '<meta name="twitter:card" content="summary" />'
    return escape(title, quote=True), html


def _fallback(tags: str, title: str, source_url: str) -> str:
    target = escape(f"/?url={quote(source_url, safe='')}", quote=True)
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\" />"
        f"<title>{title} · linkhop</title>{tags}"
        f'<meta http-equiv="refresh" content="0; url={target}" /></head>'
        f'<body><a href="{target}">linkhop</a></body></html>'
    )


@router.get("/c/{short_id}", include_in_schema=False, response_class=HTMLResponse)
async def share_page(short_id: str, request: Request) -> HTMLResponse:
    shell = await _frontend_shell(request)

    async with request.app.state.session_factory() as session:
        row = await ShortIdService(session).peek(short_id)
    if row is None:
        return HTMLResponse(shell or "", status_code=404)

    try:
        conversion = await convert_view(request, url=row.source_url, targets=None, share=False)
    except Exception:
        # The preview is a courtesy to link unfurlers; the app shows the real error.
        return HTMLResponse(shell or _fallback("", "linkhop", row.source_url))

    page_url = f"{request.url.scheme}://{request.headers.get('host', '')}/c/{short_id}"
    title, tags = _preview_tags(conversion, page_url)
    if shell is None:
        return HTMLResponse(_fallback(tags, title, row.source_url))

    html = shell.replace("<title>linkhop</title>", f"<title>{title} · linkhop</title>", 1)
    return HTMLResponse(html.replace("</head>", f"{tags}</head>", 1))
