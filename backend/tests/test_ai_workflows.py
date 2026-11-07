from collections.abc import Callable
from typing import Any

import httpx2
import openai
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.integrations.interfaces import (
    ProviderPermanentError,
    ProviderTransientError,
    StructuredResult,
)
from app.integrations.openai.provider import OpenAIProvider
from app.modules.ai_engine import workflows
from app.modules.ai_engine.schemas import SectionLLM
from tests.helpers import HEART_PAGES, create_course, make_pdf, upload_and_complete

Login = Callable[..., TestClient]


def _course_with_pdf(t: TestClient) -> tuple[str, str]:
    cid = create_course(t)
    doc = upload_and_complete(t, cid, make_pdf(HEART_PAGES))["document"]["id"]
    return cid, doc


def _apply_first_proposal(t: TestClient, cid: str) -> list[dict[str, Any]]:
    job = t.post(f"/api/v1/courses/{cid}/ai/outline")
    assert job.status_code == 202 and job.json()["status"] == "completed", job.json()
    proposal = t.get(f"/api/v1/courses/{cid}/ai/outline-proposals").json()[0]
    chapters = [
        {
            "title": c["title"],
            "description": c["description"],
            "source_refs": c["source_refs"],
            "objectives": [o["text"] for o in c["objectives"]],
        }
        for c in proposal["output"]["chapters"]
    ]
    r = t.post(f"/api/v1/ai/outline-proposals/{proposal['id']}/apply", json={"chapters": chapters})
    assert r.status_code == 200, r.text
    result: list[dict[str, Any]] = r.json()
    return result


def test_outline_proposal_review_and_apply(login: Login) -> None:
    t = login("t@example.com")
    cid, doc = _course_with_pdf(t)
    job = t.post(f"/api/v1/courses/{cid}/ai/outline").json()
    assert job["result"]["chapters"] >= 1
    proposals = t.get(f"/api/v1/courses/{cid}/ai/outline-proposals").json()
    p = proposals[0]
    assert p["status"] == "proposed" and p["prompt_id"] == "document_analysis"
    assert all(r["document_id"] == doc for c in p["output"]["chapters"] for r in c["source_refs"])

    # Teacher edits the proposal before applying: rename and keep only the first chapter.
    first = p["output"]["chapters"][0]
    edited = [
        {
            "title": "Edited title",
            "description": first["description"],
            "source_refs": first["source_refs"],
            "objectives": ["Name the four chambers"],
        }
    ]
    created = t.post(f"/api/v1/ai/outline-proposals/{p['id']}/apply", json={"chapters": edited})
    assert [c["title"] for c in created.json()] == ["Edited title"]
    assert created.json()[0]["status"] == "draft"
    detail = t.get(f"/api/v1/chapters/{created.json()[0]['id']}").json()
    assert [o["objective_text"] for o in detail["objectives"]] == ["Name the four chambers"]

    again = t.post(f"/api/v1/ai/outline-proposals/{p['id']}/apply", json={"chapters": edited})
    assert again.status_code == 409


def test_outline_requires_ready_sources(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    r = t.post(f"/api/v1/courses/{cid}/ai/outline")
    assert r.status_code == 422 and r.json()["error"]["code"] == "NO_SOURCES"


def test_lesson_generation_creates_unpublished_grounded_draft(login: Login) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, doc = _course_with_pdf(t)
    chapter = _apply_first_proposal(t, cid)[0]
    job = t.post(f"/api/v1/chapters/{chapter['id']}/ai/lesson").json()
    assert job["status"] == "completed", job
    assert job["result"]["retrieval"] == "chapter_page_ranges"
    lesson = t.get(f"/api/v1/lessons/{job['result']['lesson_id']}").json()
    assert lesson["origin"] == "ai" and lesson["published_version"] is None
    refs = [r for sec in lesson["content"]["sections"] for r in sec["source_refs"]]
    assert refs and all(r["document_id"] == doc for r in refs)

    # Not visible to students until the teacher approves and publishes.
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
    t.patch(f"/api/v1/chapters/{chapter['id']}", json={"status": "published"})
    assert s.get(f"/api/v1/lessons/{lesson['id']}").status_code == 404
    t.post(f"/api/v1/lessons/{lesson['id']}/publish")
    assert s.get(f"/api/v1/lessons/{lesson['id']}").status_code == 200

    usage = t.get(f"/api/v1/courses/{cid}/ai/usage").json()
    assert usage["calls"] == 2 and usage["input_tokens"] > 0
    assert usage["estimated_cost_usd"] is None  # no prices configured → no guessed cost


def test_lexical_retrieval_when_chapter_has_no_page_ranges(login: Login) -> None:
    t = login("t@example.com")
    cid, _ = _course_with_pdf(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Ventricle and aorta"}).json()
    job = t.post(f"/api/v1/chapters/{ch['id']}/ai/lesson").json()
    assert job["status"] == "completed" and job["result"]["retrieval"] == "lexical"


def test_section_regeneration_versions_and_conflicts(login: Login) -> None:
    t = login("t@example.com")
    cid, _ = _course_with_pdf(t)
    chapter = _apply_first_proposal(t, cid)[0]
    lid = t.post(f"/api/v1/chapters/{chapter['id']}/ai/lesson").json()["result"]["lesson_id"]
    v = t.get(f"/api/v1/lessons/{lid}").json()["version"]

    stale = t.post(
        f"/api/v1/lessons/{lid}/ai/sections/0/regenerate", json={"expected_version": v + 5}
    )
    assert stale.status_code == 409
    missing = t.post(
        f"/api/v1/lessons/{lid}/ai/sections/99/regenerate", json={"expected_version": v}
    )
    assert missing.status_code == 404

    job = t.post(
        f"/api/v1/lessons/{lid}/ai/sections/0/regenerate",
        json={"expected_version": v, "instruction": "Simpler words"},
    ).json()
    assert job["status"] == "completed", job
    versions = t.get(f"/api/v1/lessons/{lid}/versions").json()
    assert versions[0]["version_number"] == v + 1
    assert versions[0]["change_source"] == "ai_section"


def test_other_teacher_cannot_trigger_ai(login: Login) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    cid, _ = _course_with_pdf(t)
    assert other.post(f"/api/v1/courses/{cid}/ai/outline").status_code == 404
    assert other.get(f"/api/v1/courses/{cid}/ai/usage").status_code == 404


def test_daily_ai_budget(login: Login, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("EDU3D_AI_MAX_JOBS_PER_COURSE_PER_DAY", "1")
    get_settings.cache_clear()
    t = login("t@example.com")
    cid, _ = _course_with_pdf(t)
    assert t.post(f"/api/v1/courses/{cid}/ai/outline").status_code == 202
    r = t.post(f"/api/v1/courses/{cid}/ai/outline")
    assert r.status_code == 429 and r.json()["error"]["code"] == "AI_BUDGET_EXCEEDED"


class _FailingProvider:
    name = "failing"
    model = "x"

    def __init__(self, exc: Exception) -> None:
        self.exc = exc

    def generate_structured(self, **_: Any) -> StructuredResult[Any]:
        raise self.exc


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (ProviderTransientError("timeout"), "RETRIES_EXHAUSTED"),
        (ProviderPermanentError("refused"), "PROVIDER_ERROR"),
    ],
)
def test_provider_failures_fail_job_safely(
    login: Login, monkeypatch: pytest.MonkeyPatch, exc: Exception, code: str
) -> None:
    t = login("t@example.com")
    cid, _ = _course_with_pdf(t)
    monkeypatch.setattr(workflows, "get_llm_provider", lambda: _FailingProvider(exc))
    job = t.post(f"/api/v1/courses/{cid}/ai/outline").json()
    assert job["status"] == "failed" and job["error_code"] == code
    assert t.get(f"/api/v1/courses/{cid}/ai/outline-proposals").json() == []


# ---------------------------------------------------------------- OpenAI adapter


class _Usage(BaseModel):
    input_tokens: int
    output_tokens: int


class _Resp:
    def __init__(self, parsed: Any) -> None:
        self.output_parsed = parsed
        self.usage = _Usage(input_tokens=10, output_tokens=5)
        self.id = "resp_123"


def _adapter(parse: Callable[..., Any]) -> OpenAIProvider:
    p = OpenAIProvider(api_key="test", model="test-model", timeout_s=5)
    p.client = type("C", (), {"responses": type("R", (), {"parse": staticmethod(parse)})()})()
    return p


def _call(p: OpenAIProvider) -> StructuredResult[SectionLLM]:
    return p.generate_structured(
        system_prompt="s",
        task="t",
        references=[],
        output_schema=SectionLLM,
        prompt_version="x@1",
        max_output_tokens=100,
    )


def test_openai_adapter_normalizes_success() -> None:
    sec = SectionLLM(title="t", body_markdown="b", key_terms=[], source_refs=[])
    captured: dict[str, Any] = {}

    def parse(**kw: Any) -> _Resp:
        captured.update(kw)
        return _Resp(sec)

    result = _call(_adapter(parse))
    assert result.output == sec
    assert result.usage.input_tokens == 10 and result.usage.provider_request_id == "resp_123"
    assert captured["store"] is False and captured["text_format"] is SectionLLM


def test_openai_adapter_maps_errors() -> None:
    req = httpx2.Request("POST", "https://api.openai.com/v1/responses")

    def timeout(**_: Any) -> None:
        raise openai.APITimeoutError(request=req)

    with pytest.raises(ProviderTransientError):
        _call(_adapter(timeout))
    with pytest.raises(ProviderPermanentError):
        _call(_adapter(lambda **_: _Resp(None)))
