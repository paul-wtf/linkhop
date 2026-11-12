from pathlib import Path

import httpx
import pytest
import respx

from linkhop.short_links import expand
from linkhop.url_parser import UnsupportedUrlError

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
async def http():
    async with httpx.AsyncClient() as client:
        yield client


@respx.mock
async def test_ordinary_link_is_returned_without_a_request(http):
    url = "https://open.spotify.com/track/7xtG2Kac0KPcd1ThPEGbZw"
    assert await expand(url, http) == url
    assert not respx.calls


@respx.mock
async def test_spotify_short_link_is_read_from_the_landing_page(http):
    respx.get("https://spotify.link/hRkBrwub9xb").respond(
        307, headers={"location": "https://spotify.app.link/hRkBrwub9xb?_p=c41129"}
    )
    respx.get("https://spotify.app.link/hRkBrwub9xb").respond(
        text=(FIX / "spotify_app_link.html").read_text()
    )
    assert await expand("https://spotify.link/hRkBrwub9xb", http) == (
        "https://open.spotify.com/track/7xtG2Kac0KPcd1ThPEGbZw"
    )


@respx.mock
async def test_deezer_short_link_follows_the_redirect(http):
    respx.get("https://link.deezer.com/s/30abc").respond(
        302, headers={"location": "https://www.deezer.com/track/3135556?utm_source=deezer"}
    )
    assert await expand("https://link.deezer.com/s/30abc", http) == (
        "https://www.deezer.com/track/3135556?utm_source=deezer"
    )


@respx.mock
async def test_redirect_to_a_foreign_host_is_refused(http):
    respx.get("https://link.deezer.com/s/30abc").respond(
        302, headers={"location": "https://169.254.169.254/latest/meta-data"}
    )
    with pytest.raises(UnsupportedUrlError):
        await expand("https://link.deezer.com/s/30abc", http)


@respx.mock
async def test_redirect_to_plain_http_is_refused(http):
    respx.get("https://link.deezer.com/s/30abc").respond(
        302, headers={"location": "http://www.deezer.com/track/3135556"}
    )
    with pytest.raises(UnsupportedUrlError):
        await expand("https://link.deezer.com/s/30abc", http)


@respx.mock
async def test_landing_page_without_a_link_is_refused(http):
    respx.get("https://spotify.app.link/x").respond(text="<html>nothing here</html>")
    with pytest.raises(UnsupportedUrlError):
        await expand("https://spotify.app.link/x", http)


@respx.mock
async def test_redirect_loop_is_refused(http):
    respx.get("https://spotify.link/a").respond(
        307, headers={"location": "https://spotify.link/a"}
    )
    with pytest.raises(UnsupportedUrlError):
        await expand("https://spotify.link/a", http)


@respx.mock
async def test_unreachable_short_host_is_refused(http):
    respx.get("https://spotify.link/a").mock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(UnsupportedUrlError):
        await expand("https://spotify.link/a", http)
