from __future__ import annotations

from xml.sax.saxutils import quoteattr

from fastapi import APIRouter, Request, Response

router = APIRouter(prefix="/api/v1", tags=["opensearch"])

_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>linkhop</ShortName>
  <Description>Musik-Links zwischen Streaming-Diensten konvertieren</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" template={template}/>
</OpenSearchDescription>
"""


@router.get("/opensearch.xml", include_in_schema=False)
async def opensearch(request: Request) -> Response:
    # The description must carry absolute URLs, and a self-hosted instance
    # only learns its public origin from the request.
    origin = f"{request.url.scheme}://{request.headers.get('host', '')}"
    return Response(
        content=_TEMPLATE.format(template=quoteattr(f"{origin}/?url={{searchTerms}}")),
        media_type="application/opensearchdescription+xml",
    )
