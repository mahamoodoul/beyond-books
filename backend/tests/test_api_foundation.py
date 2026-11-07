from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app(), raise_server_exceptions=False)


def test_health_ok_and_request_id_header() -> None:
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.headers["X-Request-ID"].startswith("req_")


def test_incoming_request_id_is_propagated_when_safe() -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": "trace_abc12345"})
    assert res.headers["X-Request-ID"] == "trace_abc12345"


def test_unsafe_incoming_request_id_is_replaced() -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert res.headers["X-Request-ID"].startswith("req_")


def test_not_found_uses_error_envelope() -> None:
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    body = res.json()
    assert body["error"]["code"] == "RESOURCE_NOT_FOUND"
    assert body["error"]["request_id"] == res.headers["X-Request-ID"]
    assert body["error"]["details"] == []
