from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import httpx

from linkhop.url_parser import UnsupportedUrlError

# Share sheets of the mobile apps hand out these instead of the real link.
_SHORT_HOSTS = frozenset({"spotify.link", "spotify.app.link", "link.deezer.com"})
# The only hosts a hop may lead to. Without this list a short link would make
# the backend fetch whatever its redirect names.
_HOP_HOSTS = _SHORT_HOSTS | {"open.spotify.com", "www.deezer.com", "deezer.com"}
_MAX_HOPS = 4

# spotify.app.link answers 200 with a landing page that forwards by script;
# the real link only appears in its markup.
_SPOTIFY_IN_PAGE = re.compile(
    r"https://open\.spotify\.com/(?:intl-[A-Za-z-]+/)?(?:track|album|artist)/[A-Za-z0-9]+"
)


def is_short_link(url: str) -> bool:
    return urlparse(url).hostname in _SHORT_HOSTS


async def expand(url: str, http: httpx.AsyncClient) -> str:
    current = url
    for _ in range(_MAX_HOPS):
        if not is_short_link(current):
            return current
        try:
            resp = await http.get(current, follow_redirects=False)
        except httpx.HTTPError as e:
            raise UnsupportedUrlError("short link could not be resolved") from e
        if resp.is_redirect:
            target = urlparse(urljoin(current, resp.headers.get("location", "")))
            if target.scheme != "https" or target.hostname not in _HOP_HOSTS:
                raise UnsupportedUrlError("short link leads to an unsupported address")
            current = target.geturl()
            continue
        match = _SPOTIFY_IN_PAGE.search(resp.text) if resp.status_code == 200 else None
        if match is None:
            raise UnsupportedUrlError("short link could not be resolved")
        return match.group(0)
    raise UnsupportedUrlError("short link redirects too often")
