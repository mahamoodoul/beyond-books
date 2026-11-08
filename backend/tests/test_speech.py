"""Voice narration (ElevenLabs text to speech): off without a key, cached per text, rate limited."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.speech import service

Login = Callable[..., TestClient]


def _enable(monkeypatch: pytest.MonkeyPatch, **env: str) -> None:
    monkeypatch.setenv("EDU3D_ELEVENLABS_API_KEY", "test-key")
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    service.speech_limiter.reset()


def test_speech_is_off_without_a_key(login: Login) -> None:
    t = login("t@example.com")
    assert t.get("/api/v1/speech/status").json() == {
        "enabled": False,
        "voice_id": None,
        "model": None,
    }
    r = t.post("/api/v1/speech", json={"text": "The heart pumps blood."})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "SPEECH_UNAVAILABLE"


def test_speech_synthesises_once_and_serves_from_cache(
    login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    spoken: list[str] = []

    def fake(text: str, voice_id: str, model: str) -> bytes:
        spoken.append(text)
        return b"ID3fake-mp3"

    monkeypatch.setattr(service, "_synthesize", fake)
    s = login("s@example.com", "student")
    status = s.get("/api/v1/speech/status").json()
    assert status["enabled"] is True and status["voice_id"] and status["model"]

    body = {"text": "  The **heart**   pumps _blood_.  "}
    r = s.post("/api/v1/speech", json=body)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert r.content == b"ID3fake-mp3"
    assert r.headers["x-speech-cache"] == "miss"

    r2 = s.post("/api/v1/speech", json=body)
    assert r2.status_code == 200 and r2.content == b"ID3fake-mp3"
    assert r2.headers["x-speech-cache"] == "hit"
    assert spoken == ["The heart pumps blood."], (
        "markdown stripped, whitespace collapsed, one vendor call"
    )


def test_speech_rate_limits_new_syntheses_only(
    login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch, EDU3D_SPEECH_PER_USER_PER_HOUR="1")
    monkeypatch.setattr(service, "_synthesize", lambda text, voice_id, model: b"x")
    t = login("t2@example.com")
    assert t.post("/api/v1/speech", json={"text": "One."}).status_code == 200
    assert t.post("/api/v1/speech", json={"text": "One."}).status_code == 200, "cache hits are free"
    r = t.post("/api/v1/speech", json={"text": "Two."})
    assert r.status_code == 429


def test_speech_vendor_failure_is_a_502_not_a_crash(
    login: Login, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)

    def boom(text: str, voice_id: str, model: str) -> bytes:
        raise RuntimeError("quota exceeded")

    monkeypatch.setattr(service, "_synthesize", boom)
    t = login("t3@example.com")
    r = t.post("/api/v1/speech", json={"text": "Hello."})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "SPEECH_FAILED"


def test_normalise_cuts_long_text_at_a_sentence() -> None:
    text = "First sentence. " * 200
    out = service.normalise(text, 300)
    assert len(out) <= 300 and out.endswith(".")
    assert service.normalise("   ", 100) == ""
