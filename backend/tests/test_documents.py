from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.helpers import HEART_PAGES, create_course, make_pdf, upload, upload_and_complete

Login = Callable[..., TestClient]


def test_pdf_upload_extracts_pages_and_chunks(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    res = upload_and_complete(t, cid, make_pdf(HEART_PAGES))
    doc = res["document"]
    assert res["job"]["status"] == "completed", res["job"]
    assert doc["processing_status"] == "ready"
    assert doc["page_count"] == 3
    assert doc["original_filename"] == "heart.pdf"  # path components stripped

    pages = t.get(f"/api/v1/documents/{doc['id']}/pages").json()
    assert pages["total"] == 3
    assert "four chambers" in pages["items"][0]["extracted_text"]

    job = t.get(f"/api/v1/jobs/{res['job']['id']}").json()
    assert job["result"]["chunks"] >= 1
    assert [d["id"] for d in t.get(f"/api/v1/courses/{cid}/documents").json()] == [doc["id"]]


def test_pasted_text_document(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    text = "\n\n".join(HEART_PAGES * 20)
    r = t.post("/api/v1/documents/text", json={"course_id": cid, "title": "Notes", "text": text})
    assert r.status_code == 201
    assert r.json()["document"]["processing_status"] == "ready"
    assert r.json()["document"]["page_count"] >= 2


def test_rejects_file_whose_content_is_not_a_pdf(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    doc_id = upload(t, cid, b"MZ\x90\x00 definitely not a pdf")["document"]["id"]
    r = t.post(f"/api/v1/documents/{doc_id}/complete")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_UPLOAD"


def test_rejects_size_mismatch(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    data = make_pdf(["hello"])
    r = t.post(
        "/api/v1/documents/upload-url",
        json={
            "course_id": cid,
            "filename": "a.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(data) + 10,
        },
    )
    body = r.json()
    t.put(body["upload"]["url"], content=data, headers=body["upload"]["headers"])
    assert t.post(f"/api/v1/documents/{body['document']['id']}/complete").status_code == 422


def test_upload_url_cannot_exceed_declared_size(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    r = t.post(
        "/api/v1/documents/upload-url",
        json={
            "course_id": cid,
            "filename": "a.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 10,
        },
    )
    body = r.json()
    put = t.put(
        body["upload"]["url"], content=b"%PDF-" + b"x" * 100, headers=body["upload"]["headers"]
    )
    assert put.status_code == 413


def test_rejects_disallowed_mime_type_and_oversize(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    r = t.post(
        "/api/v1/documents/upload-url",
        json={
            "course_id": cid,
            "filename": "x.exe",
            "mime_type": "application/x-msdownload",
            "size_bytes": 10,
        },
    )
    assert r.status_code == 422
    r = t.post(
        "/api/v1/documents/upload-url",
        json={
            "course_id": cid,
            "filename": "x.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 10**10,
        },
    )
    assert r.status_code == 422


def test_forged_upload_token_rejected(client: TestClient) -> None:
    r = client.put(
        "/api/v1/storage/uploads/not-a-token",
        content=b"x",
        headers={"Content-Type": "application/pdf"},
    )
    assert r.status_code == 404


def test_scanned_pdf_without_text_fails_cleanly(login: Login) -> None:
    t = login("t@example.com")
    cid = create_course(t)
    res = upload_and_complete(t, cid, make_pdf(["", ""]))
    assert res["job"]["status"] == "failed"
    assert res["job"]["error_code"] == "NO_TEXT"
    doc = t.get(f"/api/v1/documents/{res['document']['id']}").json()
    assert doc["processing_status"] == "failed"
    assert "OCR" in doc["error_message"]


def test_other_teacher_cannot_read_document_or_job(login: Login) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    cid = create_course(t)
    res = upload_and_complete(t, cid, make_pdf(HEART_PAGES))
    assert other.get(f"/api/v1/documents/{res['document']['id']}").status_code == 404
    assert other.get(f"/api/v1/documents/{res['document']['id']}/pages").status_code == 404
    assert other.get(f"/api/v1/jobs/{res['job']['id']}").status_code == 404
    assert (
        other.post(
            "/api/v1/documents/upload-url",
            json={
                "course_id": cid,
                "filename": "a.pdf",
                "mime_type": "application/pdf",
                "size_bytes": 10,
            },
        ).status_code
        == 404
    )
