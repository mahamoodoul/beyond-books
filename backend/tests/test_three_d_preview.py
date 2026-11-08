"""2D pictures of 3D models: the renderer, automatic pictures on upload/seed, the URLs in the
API (library, resolved scenes, student Studio) and the backfill for older models."""

import struct
import zlib
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.storage import get_storage
from app.modules.three_d.demo_heart import build_heart_glb
from app.modules.three_d.models import ThreeDAssetVersion
from app.modules.three_d.preview import (
    HEIGHT,
    WIDTH,
    PreviewError,
    backfill_previews,
    preview_key,
    render_png,
)
from app.modules.three_d.seed import seed_demo_heart
from tests.test_three_d import _lesson, _upload_asset, heart_spec

Login = Callable[..., TestClient]


def _pixels(png: bytes) -> tuple[int, int, bytes]:
    """Decode our own RGBA, filter-0 PNG (enough for the renderer's output)."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", png[16:24])
    idat = b""
    i = 8
    while i < len(png):
        length = struct.unpack(">I", png[i : i + 4])[0]
        kind = png[i + 4 : i + 8]
        if kind == b"IDAT":
            idat += png[i + 8 : i + 8 + length]
        i += 12 + length
    raw = zlib.decompress(idat)
    rows = b"".join(raw[r * (w * 4 + 1) + 1 : (r + 1) * (w * 4 + 1)] for r in range(h))
    return w, h, rows


def test_renders_the_heart_with_transparent_background() -> None:
    w, h, px = _pixels(render_png(build_heart_glb()))
    assert (w, h) == (WIDTH, HEIGHT)
    alpha = px[3::4]
    assert alpha[0] == 0 and alpha[-1] == 0  # corners are transparent
    drawn = sum(1 for a in alpha if a > 200)
    assert 0.15 < drawn / (w * h) < 0.9  # the model fills a good part of the frame
    centre = ((h // 2) * w + w // 2) * 4
    r, g, b, a = px[centre : centre + 4]
    assert a == 255 and (r, g, b) != (0, 0, 0)


def test_rejects_files_that_are_not_models() -> None:
    try:
        render_png(b"not a glb at all")
    except PreviewError:
        pass
    else:
        raise AssertionError("expected PreviewError")
    assert preview_key("assets/x/v2/model.glb") == "assets/x/v2/preview.png"


def test_upload_creates_picture_and_library_shows_it(login: Login) -> None:
    t = login("t@example.com")
    body = _upload_asset(t, build_heart_glb())["complete"].json()
    meta = body["versions"][0]["metadata_json"]
    assert meta["preview_key"].endswith("/v1/preview.png")
    assert body["preview_url"]
    img = t.get(body["preview_url"])
    assert img.status_code == 200 and img.content[:4] == b"\x89PNG"
    assert img.headers["content-type"] == "image/png"
    listed = next(a for a in t.get("/api/v1/assets").json() if a["id"] == body["id"])
    assert listed["preview_url"]


def test_scene_and_student_studio_include_the_picture(login: Login, db: Session) -> None:
    seed_demo_heart(db)
    t = login("t@example.com")
    s = login("s@example.com", "student")
    cid, _, lid = _lesson(t, publish=True)
    t.post(f"/api/v1/courses/{cid}/enrollments", json={"student_email": "s@example.com"})
    scene = t.post(f"/api/v1/lessons/{lid}/scenes", json={"spec": heart_spec()}).json()
    t.post(f"/api/v1/scenes/{scene['id']}/publish")
    resolved = s.get(f"/api/v1/scenes/{scene['id']}/resolved").json()
    assert s.get(resolved["assets"][0]["preview_url"]).content[:4] == b"\x89PNG"
    studio = s.get("/api/v1/studio/scenes").json()
    assert studio and studio[0]["preview_url"]


def test_backfill_renders_missing_pictures_only(db: Session) -> None:
    seed_demo_heart(db)
    v = db.scalar(select(ThreeDAssetVersion))
    assert v is not None
    key = v.metadata_json["preview_key"]
    get_storage().delete(key)  # e.g. a model created before pictures existed
    v.metadata_json = {k: x for k, x in v.metadata_json.items() if k != "preview_key"}
    db.commit()
    assert backfill_previews(db) == {"rendered": 1, "skipped": 0, "failed": 0}
    assert get_storage().head(key) is not None
    assert backfill_previews(db) == {"rendered": 0, "skipped": 1, "failed": 0}
    assert backfill_previews(db, force=True)["rendered"] == 1
