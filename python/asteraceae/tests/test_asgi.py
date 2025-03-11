from __future__ import annotations

from starlette.testclient import TestClient

def test_service(service):
  with TestClient(app=service.to_asgi()) as client:
    resp = client.post("/suggests", json={"essay": "The meaning of life is absurdism", "max_tokens": 4096})

    assert resp.status_code == 200
