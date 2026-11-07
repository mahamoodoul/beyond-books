"""Share course data between machines: export a teacher's courses as a seed bundle, import it
for another teacher (e.g. a collaborator's local setup). No AI calls are made on import.

The bundle (seeds/courses/) holds:
  bundle.json  rows of every table that makes up the courses: courses, source documents with
               their extracted pages/chunks, chapters, objectives, lessons (+ versions),
               quizzes (+ versions), 3D scenes and animations, the 3D models they use (and the
               teacher's own models), plus the teacher's saved AI prompts
  files/       the 3D model files (.glb, Git LFS)
Course PDFs are not duplicated: they are taken from sample-courses/ (Git LFS) by file name.

Rows keep their ids, so every link (lesson -> chapter, quiz -> objective, scene -> model) stays
valid. User/school columns are reassigned to the importing teacher. Importing is idempotent:
rows that already exist are skipped. New columns added later are carried over automatically.

    cd backend
    EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/course_seed.py export teacher@gmail.com
    EDU3D_ENV_FILE=.env .venv/bin/python ../scripts/course_seed.py import you@example.com
"""

import json
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Table, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app.main  # noqa: E402,F401  (registers every model)
from app.database.base import Base  # noqa: E402
from app.database.session import session_factory  # noqa: E402
from app.integrations.storage import get_storage  # noqa: E402

BUNDLE = ROOT / "seeds" / "courses"
FORMAT = 1
# Insert order respects foreign keys.
TABLES = [
    "courses",
    "source_documents",
    "document_pages",
    "document_chunks",
    "chapters",
    "learning_objectives",
    "lessons",
    "lesson_versions",
    "assessments",
    "assessment_versions",
    "three_d_assets",
    "three_d_asset_versions",
    "three_d_scenes",
    "three_d_animations",
    "three_d_prompt_drafts",
]


def table(name: str) -> Table:
    return Base.metadata.tables[name]


def _fk_target(col: Any) -> str | None:
    fk = next(iter(col.foreign_keys), None)
    return fk.column.table.name if fk is not None else None


def _dump(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _load(col: Any, value: Any) -> Any:
    if value is None:
        return None
    kind = type(col.type).__name__
    if kind == "Uuid":
        return uuid.UUID(str(value))
    if kind in {"UTCDateTime", "DateTime"}:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return value


def _rows(db: Any, name: str, where: Any) -> list[dict[str, Any]]:
    t = table(name)
    return [
        {k: _dump(v) for k, v in row._mapping.items()}
        for row in db.execute(select(t).where(where))
    ]


def _ids(rows: list[dict[str, Any]]) -> list[uuid.UUID]:
    return [uuid.UUID(r["id"]) for r in rows]


# ------------------------------------------------------------------------- export
def export(email: str) -> None:
    db = session_factory()()
    users = table("users")
    user_id = db.scalar(select(users.c.id).where(users.c.email == email))
    if user_id is None:
        raise SystemExit(f"No user {email!r}.")
    data: dict[str, list[dict[str, Any]]] = {}
    t = table
    data["courses"] = _rows(db, "courses", t("courses").c.created_by == user_id)
    courses = _ids(data["courses"])
    data["source_documents"] = _rows(
        db, "source_documents", t("source_documents").c.course_id.in_(courses)
    )
    docs = _ids(data["source_documents"])
    data["document_pages"] = _rows(
        db, "document_pages", t("document_pages").c.source_document_id.in_(docs)
    )
    data["document_chunks"] = _rows(
        db, "document_chunks", t("document_chunks").c.source_document_id.in_(docs)
    )
    data["chapters"] = _rows(db, "chapters", t("chapters").c.course_id.in_(courses))
    chapters = _ids(data["chapters"])
    data["learning_objectives"] = _rows(
        db, "learning_objectives", t("learning_objectives").c.chapter_id.in_(chapters)
    )
    data["lessons"] = _rows(db, "lessons", t("lessons").c.chapter_id.in_(chapters))
    lessons = _ids(data["lessons"])
    data["lesson_versions"] = _rows(
        db, "lesson_versions", t("lesson_versions").c.lesson_id.in_(lessons)
    )
    data["assessments"] = _rows(
        db, "assessments", t("assessments").c.chapter_id.in_(chapters)
    )
    data["assessment_versions"] = _rows(
        db,
        "assessment_versions",
        t("assessment_versions").c.assessment_id.in_(_ids(data["assessments"])),
    )
    data["three_d_scenes"] = _rows(
        db, "three_d_scenes", t("three_d_scenes").c.lesson_id.in_(lessons)
    )
    data["three_d_animations"] = _rows(
        db,
        "three_d_animations",
        t("three_d_animations").c.scene_id.in_(_ids(data["three_d_scenes"])),
    )
    # 3D models: the teacher's own + any the exported scenes use (e.g. the demo heart)
    used = {
        str(ref.get("asset_id"))
        for s in data["three_d_scenes"]
        for spec in (s.get("scene_spec"), s.get("published_spec"))
        for ref in ((spec or {}).get("asset_refs") or [])
    }
    a = t("three_d_assets")
    data["three_d_assets"] = _rows(
        db, "three_d_assets", (a.c.created_by == user_id) | a.c.slug.in_(used)
    )
    data["three_d_asset_versions"] = _rows(
        db,
        "three_d_asset_versions",
        t("three_d_asset_versions").c.asset_id.in_(_ids(data["three_d_assets"])),
    )
    data["three_d_prompt_drafts"] = _rows(
        db, "three_d_prompt_drafts", t("three_d_prompt_drafts").c.user_id == user_id
    )

    # model files (GLB) into files/, same paths as in storage
    storage = get_storage()
    files = BUNDLE / "files"
    exported_files = 0
    for v in data["three_d_asset_versions"]:
        key = v.get("storage_key")
        if not key or v.get("status") != "ready":
            continue
        out = files / key
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(storage.read_bytes(key, 200 * 1024 * 1024))
        exported_files += 1
    # course PDFs come from sample-courses/ (already in the repo) - record where
    pdfs = {p.name: p for p in (ROOT / "sample-courses").rglob("*.pdf")}
    for d in data["source_documents"]:
        match = pdfs.get(d["original_filename"])
        d["_seed_pdf"] = str(match.relative_to(ROOT)) if match else None

    BUNDLE.mkdir(parents=True, exist_ok=True)
    bundle = {
        "format": FORMAT,
        "exported_at": datetime.now(UTC).isoformat(),
        "tables": data,
    }
    (BUNDLE / "bundle.json").write_text(
        json.dumps(bundle, indent=1, ensure_ascii=False)
    )
    db.close()
    counts = ", ".join(f"{k}={len(v)}" for k, v in data.items() if v)
    print(
        f"exported to {BUNDLE.relative_to(ROOT)}: {counts}; model files={exported_files}"
    )


# ------------------------------------------------------------------------- import
def load(email: str) -> None:
    bundle = json.loads((BUNDLE / "bundle.json").read_text())
    if bundle.get("format") != FORMAT:
        raise SystemExit("Unsupported seed bundle format.")
    db = session_factory()()
    users = table("users")
    user_id = db.scalar(select(users.c.id).where(users.c.email == email))
    if user_id is None:
        raise SystemExit(f"No user {email!r}. Register the account first.")
    storage = get_storage()
    added: dict[str, int] = {}
    slugs = set(db.scalars(select(table("three_d_assets").c.slug)))
    skipped_assets: set[str] = set()
    for name in TABLES:
        t = table(name)
        existing = set(db.scalars(select(t.c.id)))
        for raw in bundle["tables"].get(name, []):
            if uuid.UUID(raw["id"]) in existing:
                continue
            if name == "three_d_assets" and raw["slug"] in slugs:
                skipped_assets.add(
                    raw["id"]
                )  # same model already here (e.g. the demo heart)
                continue
            if name == "three_d_asset_versions" and raw["asset_id"] in skipped_assets:
                continue
            row: dict[str, Any] = {}
            for col in t.columns:
                if col.name not in raw:
                    continue  # column added after export: its default applies
                target = _fk_target(col)
                if target == "users":
                    row[col.name] = user_id
                elif target == "schools":
                    row[col.name] = None
                else:
                    row[col.name] = _load(col, raw[col.name])
            db.execute(t.insert().values(**row))
            added[name] = added.get(name, 0) + 1
            if name == "source_documents" and raw.get("_seed_pdf"):
                pdf = ROOT / raw["_seed_pdf"]
                if pdf.exists() and pdf.stat().st_size > 1000:  # not an LFS pointer
                    storage.put_bytes(
                        raw["storage_key"], pdf.read_bytes(), raw["mime_type"]
                    )
            if name == "three_d_asset_versions" and raw.get("storage_key"):
                f = BUNDLE / "files" / raw["storage_key"]
                if f.exists():
                    storage.put_bytes(
                        raw["storage_key"], f.read_bytes(), "model/gltf-binary"
                    )
    db.commit()
    db.close()
    if not added:
        print("nothing to import: everything in the bundle is already here")
        return
    print("imported: " + ", ".join(f"{k}={v}" for k, v in added.items()))


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in {"export", "import"}:
        raise SystemExit("usage: course_seed.py export|import TEACHER_EMAIL")
    (export if sys.argv[1] == "export" else load)(sys.argv[2])
