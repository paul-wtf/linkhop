import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from linkhop.config import Settings
from linkhop.main import create_app

NS = {"os": "http://a9.com/-/spec/opensearch/1.1/"}


def test_opensearch_description_points_at_the_requesting_host():
    client = TestClient(create_app(Settings()))
    resp = client.get("/api/v1/opensearch.xml", headers={"host": "linkhop.example"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/opensearchdescription+xml")
    root = ET.fromstring(resp.text)
    assert root.findtext("os:ShortName", namespaces=NS) == "linkhop"
    url = root.find("os:Url", NS)
    assert url is not None
    assert url.get("type") == "text/html"
    assert url.get("template") == "http://linkhop.example/?url={searchTerms}"
