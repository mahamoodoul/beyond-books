"""Export the FastAPI OpenAPI document (canonical REST contract) for frontend type generation.

Usage:
    python scripts/export_openapi.py           # write frontend/src/api/generated/openapi.json
    python scripts/export_openapi.py --check   # fail if stale (CI)
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("EDU3D_ENVIRONMENT", "test")

from app.main import create_app  # noqa: E402

OUT = ROOT / "frontend" / "src" / "api" / "generated" / "openapi.json"


def main() -> int:
    content = json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != content:
            print("stale openapi.json. Run: python scripts/export_openapi.py && npm run api:types")
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(content)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
