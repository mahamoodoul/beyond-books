from typing import Any

import pymupdf
from fastapi.testclient import TestClient


def make_pdf(pages: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(50, 50, 550, 800), text, fontsize=10)
    data: bytes = doc.tobytes()
    doc.close()
    return data


HEART_PAGES = [
    "The Circulatory System\n\nThe heart is a muscular organ that pumps blood through the body. "
    "It has four chambers: two atria and two ventricles.",
    "Blood enters the right atrium from the body and moves into the right ventricle, which pumps "
    "it to the lungs. Oxygen-rich blood returns to the left atrium.",
    "The left ventricle has the thickest wall because it pumps blood to the entire body through "
    "the aorta. Valves keep blood flowing in one direction.",
]


def create_course(c: TestClient, **kw: Any) -> str:
    r = c.post("/api/v1/courses", json={"title": "Biology", "subject": "biology", **kw})
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


def upload(
    c: TestClient,
    course_id: str,
    data: bytes,
    mime: str = "application/pdf",
    declared_size: int | None = None,
) -> dict[str, Any]:
    r = c.post(
        "/api/v1/documents/upload-url",
        json={
            "course_id": course_id,
            "filename": "../../etc/heart.pdf",
            "mime_type": mime,
            "size_bytes": declared_size or len(data),
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    put = c.put(body["upload"]["url"], content=data, headers=body["upload"]["headers"])
    assert put.status_code == 204, put.text
    res: dict[str, Any] = body
    return res


def upload_and_complete(c: TestClient, course_id: str, data: bytes) -> dict[str, Any]:
    doc_id = upload(c, course_id, data)["document"]["id"]
    r = c.post(f"/api/v1/documents/{doc_id}/complete")
    assert r.status_code == 200, r.text
    res: dict[str, Any] = r.json()
    return res
