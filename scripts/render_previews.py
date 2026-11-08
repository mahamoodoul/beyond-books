"""Render the 2D picture of every 3D model that has none yet (or all of them with --force).

New models get their picture automatically when they are generated or uploaded; this backfills
models created before that, or after changing the renderer.

    cd backend && .venv/bin/python ../scripts/render_previews.py [--force]
    make previews [FORCE=1]
"""

import argparse
import sys
import time
from pathlib import Path

_backend = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_backend if _backend.is_dir() else Path.cwd()))

import app.main  # noqa: E402,F401  (registers every model)
from app.database.session import session_factory  # noqa: E402
from app.modules.three_d.preview import backfill_previews  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Render 2D pictures of the 3D models.")
    ap.add_argument("--force", action="store_true", help="re-render pictures that already exist")
    args = ap.parse_args()
    started = time.monotonic()
    db = session_factory()()
    try:
        counts = backfill_previews(db, force=args.force)
    finally:
        db.close()
    print(
        f"pictures: {counts['rendered']} rendered, {counts['skipped']} already there, "
        f"{counts['failed']} failed ({time.monotonic() - started:.1f} s)"
    )
