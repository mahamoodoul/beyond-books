"""Copy all data from a local SQLite database (backend/dev.db) into PostgreSQL.

The target is the app's configured database (EDU3D_DATABASE_URL, e.g. from backend/.env). It
must already have the schema (`make migrate`) and be empty; nothing is changed in the SQLite file.
SQLite never enforced foreign keys, so orphan references (rows pointing at deleted users/models)
are cleared when the column is nullable, otherwise the row is left out (reported at the end).

    make sqlite-to-postgres                     # backend/dev.db -> EDU3D_DATABASE_URL
    cd backend && .venv/bin/python ../scripts/sqlite_to_postgres.py path/to/other.db
"""

import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import app.main  # noqa: E402,F401  (registers every model)
from app.core.config import get_settings  # noqa: E402
from app.database.base import Base  # noqa: E402


def copy(sqlite_path: Path) -> None:
    target = get_settings().database_url
    if not target.startswith("postgresql"):
        raise SystemExit(f"EDU3D_DATABASE_URL must point at PostgreSQL (now: {target}).")
    if not sqlite_path.is_file():
        raise SystemExit(f"No SQLite database at {sqlite_path}.")
    print(f"from: {sqlite_path}")
    print(f"to:   {make_url(target).render_as_string(hide_password=True)}")
    src = create_engine(f"sqlite:///{sqlite_path}")
    dst = create_engine(target)
    tables = Base.metadata.sorted_tables  # parents before children
    kept: dict[str, set[Any]] = {}
    report: dict[str, dict[str, int]] = defaultdict(
        lambda: {"copied": 0, "left out": 0, "cleared": 0}
    )
    with src.connect() as s, dst.begin() as d:
        for t in tables:
            if d.execute(select(func.count()).select_from(t)).scalar():
                raise SystemExit(
                    f"Target table {t.name} is not empty. Use an empty, migrated database."
                )
        for t in tables:
            pk = list(t.primary_key.columns)
            key = pk[0].name if len(pk) == 1 else None
            rows = [dict(r._mapping) for r in s.execute(select(t))]
            own_ids = {r[key] for r in rows} if key else set()
            out = []
            for r in rows:
                ok = True
                for fk in t.foreign_key_constraints:
                    if len(fk.columns) != 1:
                        continue
                    col = next(iter(fk.columns))
                    value = r.get(col.name)
                    if value is None:
                        continue
                    target_table = fk.referred_table.name
                    pool = own_ids if target_table == t.name else kept.get(target_table)
                    if pool is None or value in pool:
                        continue
                    if col.nullable:
                        r[col.name] = None
                        report[t.name]["cleared"] += 1
                    else:
                        ok = False
                        break
                if ok:
                    out.append(r)
                else:
                    report[t.name]["left out"] += 1
            for i in range(0, len(out), 500):
                d.execute(t.insert(), out[i : i + 500])
            report[t.name]["copied"] = len(out)
            if key:
                kept[t.name] = {r[key] for r in out}
    total = 0
    for name, r in report.items():
        total += r["copied"]
        extra = "".join(f", {k} {v}" for k, v in r.items() if k != "copied" and v)
        if r["copied"] or extra:
            print(f"  {name}: {r['copied']}{extra}")
    print(f"done: {total} rows copied. 'left out' / 'cleared' = orphan references to deleted rows.")


if __name__ == "__main__":
    copy(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "backend" / "dev.db")
