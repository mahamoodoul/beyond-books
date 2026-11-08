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
import os
import re
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Table, select

# Repo root (seeds/, sample-courses/). In Docker the repo folders are mounted at SEED_ROOT and
# the app code is the container's working directory (/app).
ROOT = Path(os.environ.get("SEED_ROOT") or Path(__file__).resolve().parents[1])
_backend = ROOT / "backend"
sys.path.insert(0, str(_backend if _backend.is_dir() else Path.cwd()))

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
    "circuit_labs",  # labs (circuit, molecules, buoyancy ...) in the courses, plus standalone ones
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
        {k: _dump(v) for k, v in row._mapping.items()} for row in db.execute(select(t).where(where))
    ]


def _ids(rows: list[dict[str, Any]]) -> list[uuid.UUID]:
    return [uuid.UUID(r["id"]) for r in rows]


def _norm(name: str) -> str:
    # uploads clean file names ("(Ch 3-4)" -> "_Ch 3-4_"), so compare letters/digits only
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def _find_pdf(filename: str) -> Path | None:
    """The course PDF in sample-courses/ for an uploaded file name."""
    want = _norm(filename)
    return next(
        (p for p in sorted((ROOT / "sample-courses").rglob("*.pdf")) if _norm(p.name) == want),
        None,
    )


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
    data["assessments"] = _rows(db, "assessments", t("assessments").c.chapter_id.in_(chapters))
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
    # labs: those inside the exported courses, and the teacher's standalone ones (no course).
    # Student sessions are personal data and stay out of the bundle.
    labs = t("circuit_labs")
    data["circuit_labs"] = _rows(
        db,
        "circuit_labs",
        labs.c.course_id.in_(courses)
        | (labs.c.course_id.is_(None) & (labs.c.created_by == user_id)),
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
    for d in data["source_documents"]:
        match = _find_pdf(d["original_filename"])
        d["_seed_pdf"] = str(match.relative_to(ROOT)) if match else None

    BUNDLE.mkdir(parents=True, exist_ok=True)
    bundle = {
        "format": FORMAT,
        "exported_at": datetime.now(UTC).isoformat(),
        "tables": data,
    }
    (BUNDLE / "bundle.json").write_text(json.dumps(bundle, indent=1, ensure_ascii=False))
    db.close()
    counts = ", ".join(f"{k}={len(v)}" for k, v in data.items() if v)
    print(f"exported to {BUNDLE.relative_to(ROOT)}: {counts}; model files={exported_files}")


# ------------------------------------------------------------------------- import
LFS_POINTER = b"version https://git-lfs"
# Where to fetch Git LFS files that were checked out as placeholders (e.g. a deploy that cloned
# without LFS). The repository is public, so no credentials are needed; empty disables it.
LFS_REPO = os.environ.get("SEED_LFS_REPO", "https://github.com/mahamoodoul/beyond-books.git")


def _real_file(path: Path) -> bool:
    """False for a Git LFS placeholder (run `git lfs pull` to get the real file)."""
    with path.open("rb") as f:
        return not f.read(len(LFS_POINTER)).startswith(LFS_POINTER)


def _download_lfs(pointer: str) -> bytes | None:
    """The real file for a Git LFS placeholder, from the repository's LFS server (verified)."""
    import hashlib
    import urllib.request

    oid = re.search(r"^oid sha256:([0-9a-f]{64})$", pointer, re.M)
    size = re.search(r"^size (\d+)$", pointer, re.M)
    if not (LFS_REPO and oid and size):
        return None
    batch = json.dumps(
        {
            "operation": "download",
            "transfers": ["basic"],
            "objects": [{"oid": oid.group(1), "size": int(size.group(1))}],
        }
    ).encode()
    headers = {
        "Accept": "application/vnd.git-lfs+json",
        "Content-Type": "application/vnd.git-lfs+json",
    }
    try:
        req = urllib.request.Request(  # noqa: S310  https URL from SEED_LFS_REPO
            LFS_REPO.rstrip("/") + "/info/lfs/objects/batch", data=batch, headers=headers
        )
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310  fixed https URL
            action = json.load(r)["objects"][0]["actions"]["download"]
        dl = urllib.request.Request(action["href"], headers=action.get("header") or {})  # noqa: S310
        with urllib.request.urlopen(dl, timeout=180) as r:  # noqa: S310  URL from the LFS server
            data = r.read()
    except (OSError, ValueError, KeyError, IndexError) as exc:
        print(f"  could not download {oid.group(1)[:12]} from Git LFS: {exc}")
        return None
    return data if hashlib.sha256(data).hexdigest() == oid.group(1) else None


def _file_bytes(path: Path) -> bytes | None:
    """The file's content; for a Git LFS placeholder, the real file downloaded from LFS."""
    if _real_file(path):
        return path.read_bytes()
    return _download_lfs(path.read_text(errors="replace"))


def _ensure_account(db: Any, email: str, password: str | None, kind: str) -> uuid.UUID:
    """The existing account of this kind, or a new one when a password is given."""
    users = table("users")
    row = db.execute(
        select(users.c.id, users.c.account_type).where(users.c.email == email.lower())
    ).first()
    flag = "PASSWORD" if kind == "teacher" else "STUDENT_PASSWORD"
    if row is not None:
        if row.account_type != kind:
            what = "Courses belong to a teacher" if kind == "teacher" else "Only students can enrol"
            raise SystemExit(
                f"{email!r} is a {row.account_type} account. {what}: use a {kind}'s email, or a "
                f"new email with {flag}=... to create a {kind} account."
            )
        return uuid.UUID(str(row.id))
    if not password:
        raise SystemExit(
            f"No account {email!r}. Add {flag}=... (12+ characters) to create this {kind} account."
        )
    from app.modules.authentication.schemas import RegisterRequest
    from app.modules.authentication.service import register

    try:
        body = RegisterRequest(
            email=email,
            password=password,
            display_name=email.split("@")[0].replace(".", " ").title(),
            account_type=kind,
        )
    except ValueError as exc:  # pydantic: weak password etc.
        reasons = "; ".join(
            str(e.get("msg", "")).removeprefix("Value error, ")
            for e in getattr(exc, "errors", lambda: [])()
        )
        raise SystemExit(f"Cannot create {email!r}: {reasons or exc}") from None
    user = register(db, body)
    print(f"created {kind} account {user.email}")
    return user.id


def _ensure_teacher(db: Any, email: str, password: str | None) -> uuid.UUID:
    return _ensure_account(db, email, password, "teacher")


def _enrol_student(db: Any, course_ids: list[str], email: str, password: str | None) -> None:
    """Enrol a student in every seeded course (through the app's own enrolment service)."""
    from app.modules.courses.models import Course
    from app.modules.courses.service import enroll
    from app.modules.users.models import User

    _ensure_account(db, email, password, "student")
    db.commit()
    added = 0
    for cid in course_ids:
        course = db.get(Course, uuid.UUID(cid))
        owner = db.get(User, course.created_by) if course else None
        if course is None or owner is None:
            continue
        added += enroll(db, owner, course.id, email, None)[0]
    db.commit()
    print(f"student {email.lower()}: enrolled in {added} new course(s), {len(course_ids)} in total")
    unpublished = db.scalars(
        select(table("courses").c.title).where(
            table("courses").c.id.in_([uuid.UUID(c) for c in course_ids]),
            table("courses").c.status != "published",
        )
    ).all()
    if unpublished:
        print(
            "  note: students only see published courses. Still drafts: " + ", ".join(unpublished)
        )


def _where() -> str:
    """Where the import writes, so a wrong database/storage is obvious."""
    from sqlalchemy.engine import make_url

    from app.core.config import get_settings

    s = get_settings()
    db = make_url(s.database_url).render_as_string(hide_password=True)
    return f"database: {db} | files: {s.storage_backend}:{s.local_storage_dir}"


def _source_file(name: str, raw: dict[str, Any]) -> tuple[Path | None, str] | None:
    """(file in the repo, content type) for a row that has a stored file, else None."""
    if name == "source_documents":
        pdf = (ROOT / raw["_seed_pdf"]) if raw.get("_seed_pdf") else None
        pdf = pdf if pdf and pdf.exists() else _find_pdf(raw["original_filename"])
        return pdf, raw["mime_type"]
    if name == "three_d_asset_versions" and raw.get("storage_key"):
        f = BUNDLE / "files" / raw["storage_key"]
        return (f if f.exists() else None), "model/gltf-binary"
    return None


def load(
    email: str,
    password: str | None = None,
    student: str | None = None,
    student_password: str | None = None,
) -> None:
    print(_where())
    bundle = json.loads((BUNDLE / "bundle.json").read_text())
    if bundle.get("format") != FORMAT:
        raise SystemExit("Unsupported seed bundle format.")
    db = session_factory()()
    user_id = _ensure_teacher(db, email, password)
    storage = get_storage()
    added: dict[str, int] = {}
    files = restored = missing = 0
    slugs = set(db.scalars(select(table("three_d_assets").c.slug)))
    skipped_assets: set[str] = set()
    for name in TABLES:
        t = table(name)
        existing = set(db.scalars(select(t.c.id)))
        for raw in bundle["tables"].get(name, []):
            is_new = uuid.UUID(raw["id"]) not in existing
            if name == "three_d_assets" and is_new and raw["slug"] in slugs:
                skipped_assets.add(raw["id"])  # same model already here (e.g. the demo heart)
                continue
            if name == "three_d_asset_versions" and raw["asset_id"] in skipped_assets:
                continue
            if is_new:
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
            # the PDF / 3D file: written for new rows, and restored when an earlier import
            # left it out (e.g. Git LFS was missing then)
            src = _source_file(name, raw)
            if src is None or (not is_new and storage.head(raw["storage_key"]) is not None):
                continue
            path, content_type = src
            data = _file_bytes(path) if path is not None else None
            if data is None:
                missing += 1
                continue
            storage.put_bytes(raw["storage_key"], data, content_type)
            files += 1
            restored += 0 if is_new else 1
    db.commit()
    if added:
        print("imported: " + ", ".join(f"{k}={v}" for k, v in added.items()))
    elif not restored:
        print("nothing to import: everything in the bundle is already here")
    if files:
        note = f" ({restored} restored)" if restored else ""
        print(f"files: {files} PDF/3D file(s) stored{note}")
    if missing:
        print(
            f"WARNING: {missing} PDF/3D file(s) are missing or Git LFS placeholders. Install Git "
            "LFS (brew install git-lfs), run `git lfs pull`, then run this again."
        )
    # 2D pictures of the 3D models (thumbnails, posters, fallback on weak devices)
    from app.modules.three_d.preview import backfill_previews

    pics = backfill_previews(db)
    if pics["rendered"] or pics["failed"]:
        print(f"pictures: {pics['rendered']} 3D model picture(s) rendered, {pics['failed']} failed")
    if student:
        _enrol_student(
            db, [c["id"] for c in bundle["tables"].get("courses", [])], student, student_password
        )
    db.close()


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Export or import the shared course seed.")
    ap.add_argument("command", choices=["export", "import"])
    ap.add_argument("email", help="teacher account")
    ap.add_argument("password", nargs="?", default=None, help="creates the teacher if new")
    ap.add_argument("--student", help="also create/enrol this student account (import)")
    ap.add_argument("--student-password", help="creates the student if new")
    args = ap.parse_args()
    if args.command == "export":
        export(args.email)
    else:
        load(args.email, args.password or None, args.student or None, args.student_password or None)
