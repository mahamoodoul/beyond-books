import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.three_d.demo_heart import build_heart_glb
from app.modules.three_d.seed import DEMO_HEART_SLUG, seed_demo_heart
from tests.helpers import create_course

Login = Callable[..., TestClient]
FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "three-d-contracts" / "fixtures"


def heart_spec(asset: str = DEMO_HEART_SLUG) -> dict[str, Any]:
    spec: dict[str, Any] = json.loads((FIXTURES / "scene_heart_01.json").read_text())
    spec["asset_refs"] = [{"asset_id": asset, "version": 1}]
    spec["animation_refs"] = []
    return spec


def solar_spec() -> dict[str, Any]:
    spec: dict[str, Any] = json.loads((FIXTURES / "scene_solar_system_01.json").read_text())
    return spec


@pytest.fixture
def seeded(db: Session) -> None:
    seed_demo_heart(db)


def _lesson(t: TestClient, publish: bool = False) -> tuple[str, str, str]:
    cid = create_course(t)
    ch = t.post(f"/api/v1/courses/{cid}/chapters", json={"title": "Heart"}).json()["id"]
    content = {"sections": [{"title": "Heart", "body_markdown": "Four chambers."}]}
    lid = t.post(f"/api/v1/chapters/{ch}/lessons", json={"title": "L", "content": content}).json()[
        "id"
    ]
    if publish:
        t.patch(f"/api/v1/courses/{cid}", json={"status": "published"})
        t.patch(f"/api/v1/chapters/{ch}", json={"status": "published"})
        t.post(f"/api/v1/lessons/{lid}/publish")
    return cid, ch, lid


def _upload_asset(t: TestClient, data: bytes, **kw: Any) -> dict[str, Any]:
    a = t.post(
        "/api/v1/assets",
        json={"name": "My Heart", "license_name": "CC-BY-4.0", "attribution_text": "Me", **kw},
    ).json()
    up = t.post(
        f"/api/v1/assets/{a['id']}/versions/upload-url", json={"size_bytes": len(data)}
    ).json()
    assert t.put(up["url"], content=data, headers=up["headers"]).status_code == 204
    r = t.post(f"/api/v1/assets/{a['id']}/versions/{up['version_number']}/complete")
    out: dict[str, Any] = {"asset": a, "complete": r}
    return out


def test_asset_upload_validate_review(login: Login) -> None:
    t = login("t@example.com")
    res = _upload_asset(t, build_heart_glb())
    body = res["complete"].json()
    assert res["complete"].status_code == 200
    assert body["review_status"] == "pending" and body["latest_version"] == 1
    assert "left_ventricle" in body["versions"][0]["metadata_json"]["node_names"]
    r = t.post(f"/api/v1/assets/{body['id']}/review", json={"decision": "approved"})
    assert r.json()["review_status"] == "approved"


def test_invalid_glb_upload_rejected(login: Login) -> None:
    t = login("t@example.com")
    res = _upload_asset(t, b"glTF" + b"\x00" * 100)
    assert res["complete"].status_code == 422
    assert res["complete"].json()["error"]["code"] == "INVALID_ASSET"


def test_private_assets_are_private(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    student = login("s@example.com", "student")
    a = _upload_asset(t, build_heart_glb())["asset"]
    assert other.get(f"/api/v1/assets/{a['id']}").status_code == 404
    slugs = [x["slug"] for x in other.get("/api/v1/assets").json()]
    assert slugs == [DEMO_HEART_SLUG]  # library asset visible, private one not
    assert student.get("/api/v1/assets").json() == []


def test_scene_with_library_asset_and_student_resolution(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, _, lid = _lesson(t, publish=True)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})

    r = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec()})
    assert r.status_code == 201, r.text
    scene = r.json()
    assert s.get(f"/api/v1/scenes/{scene['id']}/resolved").status_code == 404  # draft

    t.post(f"/api/v1/scenes/{scene['id']}/publish")
    resolved = s.get(f"/api/v1/scenes/{scene['id']}/resolved").json()
    assert resolved["assets"][0]["asset_id"] == DEMO_HEART_SLUG
    assert resolved["assets"][0]["license_name"] == "CC0-1.0"
    glb = s.get(resolved["assets"][0]["url"])
    assert glb.status_code == 200 and glb.content[:4] == b"glTF"
    assert glb.headers["content-type"] == "model/gltf-binary"

    # Teacher edits; students still get the published snapshot.
    spec = heart_spec()
    spec["title"] = "Draft title"
    upd = t.patch(f"/api/v1/scenes/{scene['id']}", json={"expected_version": 1, "spec": spec})
    assert upd.json()["has_unpublished_changes"] is True
    assert (
        s.get(f"/api/v1/scenes/{scene['id']}").json()["spec"]["title"] == "Explore the Human Heart"
    )
    stale = t.patch(f"/api/v1/scenes/{scene['id']}", json={"expected_version": 1, "spec": spec})
    assert stale.status_code == 409
    assert (
        s.patch(
            f"/api/v1/scenes/{scene['id']}", json={"expected_version": 2, "spec": spec}
        ).status_code
        == 403
    )


def test_scene_rejects_unknown_meshes_with_details(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    _, _, lid = _lesson(t)
    spec = heart_spec()
    spec["components"][0]["mesh_name"] = "pulmonary_valve"
    r = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": spec})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "SCENE_INVALID"
    assert "pulmonary_valve" in r.json()["error"]["details"][0]["msg"]


def test_scene_rejects_unapproved_or_foreign_assets(login: Login) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    a = _upload_asset(t, build_heart_glb())["complete"].json()
    _, _, lid = _lesson(t)
    assert (
        t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec(a["slug"])}).status_code
        == 422
    )  # still pending
    t.post(f"/api/v1/assets/{a['id']}/review", json={"decision": "approved"})
    assert (
        t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec(a["slug"])}).status_code
        == 201
    )
    # Another teacher cannot use someone else's private asset by guessing its slug.
    _, _, other_lid = _lesson(other)
    assert (
        other.post(
            f"/api/v1/lessons/{other_lid}/scenes", json={"spec": heart_spec(a["slug"])}
        ).status_code
        == 422
    )


def test_new_asset_version_requires_new_review_before_publish(login: Login) -> None:
    t = login("t@example.com")
    a = _upload_asset(t, build_heart_glb())["complete"].json()
    t.post(f"/api/v1/assets/{a['id']}/review", json={"decision": "approved"})
    _, _, lid = _lesson(t)
    scene = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec(a["slug"])}).json()
    data = build_heart_glb()
    up = t.post(
        f"/api/v1/assets/{a['id']}/versions/upload-url", json={"size_bytes": len(data)}
    ).json()
    t.put(up["url"], content=data, headers=up["headers"])
    t.post(f"/api/v1/assets/{a['id']}/versions/2/complete")
    r = t.post(f"/api/v1/scenes/{scene['id']}/publish")
    assert r.status_code == 422  # asset back to pending review


def test_procedural_scene_validation(login: Login) -> None:
    t = login("t@example.com")
    _, _, lid = _lesson(t)
    assert t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": solar_spec()}).status_code == 201

    bad = copy.deepcopy(solar_spec())
    bad["procedural"][0]["generator"] = "black_hole"
    assert t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": bad}).status_code == 422

    bad = copy.deepcopy(solar_spec())
    bad["procedural"][0]["params"]["planet_count"] = 99
    r = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": bad})
    assert r.status_code == 422 and "between" in r.json()["error"]["details"][0]["msg"]

    bad = copy.deepcopy(solar_spec())
    bad["components"].append({"component_id": "jupiter", "mesh_name": "jupiter", "label": "J"})
    assert t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": bad}).status_code == 422  # only 4


def test_generators_endpoint(login: Login) -> None:
    t = login("t@example.com")
    names = [g["name"] for g in t.get("/api/v1/three-d/generators").json()]
    assert names == ["solar_system", "atom", "geometry_solids"]


def test_forged_download_token_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/storage/files/not-a-token").status_code == 404


def test_other_teacher_cannot_touch_scene(login: Login, seeded: None) -> None:
    t = login("t@example.com")
    other = login("o@example.com")
    _, _, lid = _lesson(t)
    sid = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec()}).json()["id"]
    assert other.get(f"/api/v1/scenes/{sid}/resolved").status_code == 404
    assert other.post(f"/api/v1/scenes/{sid}/publish").status_code == 404
    assert other.get(f"/api/v1/lessons/{lid}/scenes").status_code == 404


def test_delete_asset(login: Login) -> None:
    from app.core.config import get_settings

    t = login("t@example.com")
    a = _upload_asset(t, build_heart_glb())["complete"].json()
    blob = Path(get_settings().local_storage_dir) / f"assets/{a['id']}/v1/model.glb"
    assert blob.exists()

    # Others can't delete it: another teacher can't see it, a student isn't a teacher.
    assert login("other@example.com").delete(f"/api/v1/assets/{a['id']}").status_code == 404
    assert login("s@example.com", "student").delete(f"/api/v1/assets/{a['id']}").status_code == 403

    r = t.delete(f"/api/v1/assets/{a['id']}")
    assert r.status_code == 204, r.text
    assert t.get(f"/api/v1/assets/{a['id']}").status_code == 404
    assert all(x["id"] != a["id"] for x in t.get("/api/v1/assets").json())
    assert not blob.exists()  # the stored model file is removed too


def test_delete_asset_refused_while_a_scene_uses_it(login: Login) -> None:
    t = login("t@example.com")
    a = _upload_asset(t, build_heart_glb())["complete"].json()
    t.post(f"/api/v1/assets/{a['id']}/review", json={"decision": "approved"})
    _, _, lid = _lesson(t, publish=True)
    scene = t.post(
        f"/api/v1/lessons/{lid}/scenes",
        json={"spec": {**heart_spec(a["slug"]), "title": "Heart 3D"}},
    ).json()
    t.post(f"/api/v1/scenes/{scene['id']}/publish")

    r = t.delete(f"/api/v1/assets/{a['id']}")
    assert r.status_code == 409, r.text
    err = r.json()["error"]
    assert err["code"] == "ASSET_IN_USE" and "Heart 3D" in err["message"]
    assert err["details"] == [{"scene_id": scene["id"], "title": "Heart 3D"}]

    # Once the scene no longer exists, the model can be deleted.
    assert t.delete(f"/api/v1/scenes/{scene['id']}").status_code == 204
    assert t.delete(f"/api/v1/assets/{a['id']}").status_code == 204
