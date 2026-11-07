"""Generate JSON Schema for the 3D contracts from the canonical Pydantic models.

Usage:
    python scripts/export_contracts.py           # write schemas
    python scripts/export_contracts.py --check   # fail if committed schemas are stale (CI)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.modules.three_d.contracts import AnimationSpec, SceneSpec  # noqa: E402

OUT = ROOT / "packages" / "three-d-contracts" / "schemas"
TARGETS = {
    "scene.schema.json": SceneSpec,
    "animation.schema.json": AnimationSpec,
}


def render(model: type) -> str:
    schema = model.model_json_schema()  # type: ignore[attr-defined]
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    OUT.mkdir(parents=True, exist_ok=True)
    for name, model in TARGETS.items():
        path = OUT / name
        content = render(model)
        if check:
            if not path.exists() or path.read_text() != content:
                stale.append(name)
        else:
            path.write_text(content)
            print(f"wrote {path.relative_to(ROOT)}")
    if stale:
        print(f"stale contract schemas: {stale}. Run: python scripts/export_contracts.py")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
