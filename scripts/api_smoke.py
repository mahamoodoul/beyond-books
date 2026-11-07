#!/usr/bin/env python3
"""Live smoke test of a RUNNING Edu3D API (local, Coolify, staging) over real HTTP.

    python scripts/api_smoke.py --base-url http://localhost:8000            # no AI cost
    python scripts/api_smoke.py --base-url https://edu3d.example.org --with-ai

Creates throw-away teacher/student accounts (needs EDU3D_OPEN_REGISTRATION=true) unless
--teacher/--student credentials are given, walks the main features, and deletes the student
account at the end. Exit code 0 = all steps passed. Standard library only.
"""

import argparse
import json
import secrets
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from typing import Any

PDF_TEXT = (
    "The heart is a muscular organ that pumps blood through the body. It has four chambers: "
    "two atria and two ventricles. The left ventricle has the thickest wall because it pumps "
    "blood to the whole body through the aorta.\n\n" * 6
)


class Client:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/") + "/api/v1"
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(self, method: str, path: str, body: Any = None, expect: tuple[int, ...] = (200,)) -> Any:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={
            "Content-Type": "application/json", "X-Requested-With": "edu3d"})
        try:
            with self.opener.open(req, timeout=300) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        if status not in expect:
            raise AssertionError(f"{method} {path} -> {status}: {raw[:300]!r}")
        return json.loads(raw) if raw else None


class Smoke:
    def __init__(self) -> None:
        self.passed = 0

    def step(self, name: str, fn: Any) -> Any:
        t0 = time.perf_counter()
        try:
            out = fn()
        except Exception as exc:  # noqa: BLE001 - report and stop
            print(f"  FAIL  {name}: {exc}")
            sys.exit(1)
        self.passed += 1
        print(f"  ok    {name} ({(time.perf_counter() - t0) * 1000:.0f} ms)")
        return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--with-ai", action="store_true", help="also run AI steps (costs tokens)")
    ap.add_argument("--teacher", help="email:password of an existing teacher")
    ap.add_argument("--student", help="email:password of an existing student")
    a = ap.parse_args()
    run = secrets.token_hex(3)
    pw = "smoke-" + secrets.token_urlsafe(12)
    t, s, x = Client(a.base_url), Client(a.base_url), Smoke()
    print(f"Edu3D API smoke test against {a.base_url}")

    x.step("health/ready", lambda: t.call("GET", "/health/ready"))

    def account(c: Client, cred: str | None, kind: str) -> dict[str, Any]:
        if cred:
            email, password = cred.split(":", 1)
        else:
            email, password = f"smoke-{kind}-{run}@example.org", pw
            c.call("POST", "/auth/register", {"email": email, "password": password,
                                              "display_name": f"Smoke {kind}", "account_type": kind}, (201,))
        c.call("POST", "/auth/login", {"email": email, "password": password})
        return {"email": email, "password": password}

    x.step("teacher login", lambda: account(t, a.teacher, "teacher"))
    stu = x.step("student login", lambda: account(s, a.student, "student"))
    course = x.step("create course", lambda: t.call("POST", "/courses", {"title": f"Smoke {run}"}, (201,)))
    cid = course["id"]
    doc = x.step("add text source + extraction", lambda: t.call(
        "POST", "/documents/text", {"course_id": cid, "title": "Heart notes", "text": PDF_TEXT}, (201,)))
    assert doc["document"]["processing_status"] in {"ready", "uploaded", "processing"}

    if a.with_ai:
        job = x.step("AI outline", lambda: t.call("POST", f"/courses/{cid}/ai/outline", expect=(202,)))
        x.step("AI outline job finished", lambda: _wait(t, job["id"]))
    ch = x.step("create chapter", lambda: t.call("POST", f"/courses/{cid}/chapters", {"title": "The heart"}, (201,)))
    x.step("publish chapter", lambda: t.call("PATCH", f"/chapters/{ch['id']}", {"status": "published"}))
    lesson = x.step("create lesson", lambda: t.call("POST", f"/chapters/{ch['id']}/lessons", {
        "title": "Chambers", "content": {"sections": [{"title": "Chambers", "body_markdown": "Four chambers."}]}}, (201,)))
    if a.with_ai:
        job = x.step("AI lesson", lambda: t.call("POST", f"/chapters/{ch['id']}/ai/lesson", expect=(202,)))
        x.step("AI lesson job finished", lambda: _wait(t, job["id"]))
    x.step("publish lesson", lambda: t.call("POST", f"/lessons/{lesson['id']}/publish"))
    x.step("publish course", lambda: t.call("PATCH", f"/courses/{cid}", {"status": "published"}))
    assets = x.step("3D library", lambda: t.call("GET", "/assets"))
    approved = [m for m in assets if m["review_status"] == "approved"]
    if approved:
        def make_scene() -> Any:
            full = t.call("GET", f"/assets/{approved[0]['id']}")
            names = full["versions"][0]["metadata_json"].get("node_names", [])[:3]
            spec = {"scene_id": f"scene_smoke_{run}", "title": "Smoke scene",
                    "asset_refs": [{"asset_id": full["slug"], "version": full["latest_version"]}],
                    "components": [{"component_id": f"part_{i}", "mesh_name": n, "label": n} for i, n in enumerate(names)]}
            sc = t.call("POST", f"/lessons/{lesson['id']}/scenes", {"spec": spec}, (201,))
            return t.call("POST", f"/scenes/{sc['id']}/publish")
        scene = x.step("3D scene create + publish", make_scene)
    quiz = x.step("create quiz", lambda: t.call("POST", f"/chapters/{ch['id']}/assessments", {"title": "Smoke quiz"}, (201,)))
    x.step("add questions", lambda: t.call("PUT", f"/assessments/{quiz['id']}/questions", {
        "expected_version": quiz["version"], "content": {"questions": [{
            "key": "q1", "question_type": "mcq", "question_text": "How many chambers?",
            "options": [{"key": "a", "text": "2"}, {"key": "b", "text": "4", "is_correct": True}]}]}}))
    x.step("publish quiz", lambda: t.call("POST", f"/assessments/{quiz['id']}/publish"))
    x.step("enroll student", lambda: t.call("POST", f"/courses/{cid}/enrollments", {"student_email": stu["email"]}))
    x.step("student outline", lambda: s.call("GET", f"/courses/{cid}/outline"))
    x.step("student reads lesson", lambda: s.call("GET", f"/lessons/{lesson['id']}"))
    if approved:
        x.step("student resolves 3D scene", lambda: s.call("GET", f"/scenes/{scene['id']}/resolved"))
    x.step("mark lesson complete", lambda: s.call("POST", f"/lessons/{lesson['id']}/progress", {"status": "completed"}))
    att = x.step("start attempt", lambda: s.call("POST", f"/assessments/{quiz['id']}/attempts", expect=(201,)))
    res = x.step("submit attempt", lambda: s.call("POST", f"/attempts/{att['attempt_id']}/submit", {
        "answers": [{"question_key": "q1", "selected_option_key": "b"}]}))
    assert res["score"] == 1 and res["status"] == "graded", res
    x.step("teacher analytics", lambda: t.call("GET", f"/courses/{cid}/analytics"))
    x.step("student data export", lambda: s.call("GET", "/users/me/export"))
    if not a.student:
        x.step("delete smoke student", lambda: s.call("DELETE", "/users/me", {"password": stu["password"]}, (204,)))
    print(f"PASSED: {x.passed} steps")


def _wait(c: Client, job_id: str) -> dict[str, Any]:
    for _ in range(120):
        job: dict[str, Any] = c.call("GET", f"/jobs/{job_id}")
        if job["status"] == "completed":
            return job
        if job["status"] in {"failed", "cancelled"}:
            raise AssertionError(f"job {job_id} {job['status']}: {job.get('error_message')}")
        time.sleep(2)
    raise AssertionError(f"job {job_id} did not finish")


if __name__ == "__main__":
    main()
