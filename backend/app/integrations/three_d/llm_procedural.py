"""3D provider "llm": an LLM designs the model as named primitives → GLB → three.js.

The model never produces code. Its structured output is clamped and validated here, converted
to geometry (app/modules/three_d/mesh.py) and then goes through the SAME pipeline as any 3D
vendor: GLB validation, storage, teacher review, scenes. Part labels/descriptions are returned as
metadata so scenes created from the asset get explanations automatically.
"""

import hashlib
import math
import re
from typing import Any

from app.integrations.interfaces import (
    LLMProvider,
    LLMUsage,
    ProviderPermanentError,
    ProviderTaskStatus,
    ThreeDTask,
)
from app.modules.ai_engine.prompts import THREE_D_MODEL_DESIGN
from app.modules.ai_engine.schemas import Model3DLLM, ModelPartLLM
from app.modules.three_d.mesh import (
    Geometry,
    MeshPart,
    box,
    capsule,
    cylinder,
    ellipsoid,
    torus,
    write_glb,
)

MAX_PARTS = 60
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")
_NAME = re.compile(r"[^a-z0-9_]+")


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if not math.isfinite(v) else max(lo, min(hi, v))


def _vec(values: list[float], n: int, lo: float, hi: float, default: float) -> list[float]:
    out = [_clamp(float(x), lo, hi) for x in values[:n]]
    return out + [default] * (n - len(out))


def _rgba(color: str, opacity: float) -> tuple[float, float, float, float]:
    m = _HEX.match(color.strip())
    h = m.group(1) if m else "8899aa"
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (r, g, b, _clamp(opacity, 0.15, 1.0))


def _geometry(p: ModelPartLLM) -> Geometry:
    a, b, c = _vec(p.size, 3, 0.01, 10.0, 0.0)
    a = a or 0.5
    b = b or a
    c = c or a
    match p.shape:
        case "box":
            return box(a, b, c)
        case "sphere":
            return ellipsoid(a, a, a)
        case "ellipsoid":
            return ellipsoid(a, b, c)
        case "cylinder":
            return cylinder(a, a, b)
        case "cone":
            return cylinder(0.0, a, b)
        case "torus":
            return torus(a, min(b, a * 0.9))
        case "capsule":
            return capsule(a, b)
    raise ProviderPermanentError(f"unsupported shape {p.shape}")


def convert_model(model: Model3DLLM) -> tuple[bytes, list[dict[str, str]]]:
    """Validated parts → (GLB bytes, part metadata). Raises ProviderPermanentError if empty."""
    parts: list[MeshPart] = []
    meta: list[dict[str, str]] = []
    used: set[str] = set()
    for p in model.parts[:MAX_PARTS]:
        name = _NAME.sub("_", p.name.lower()).strip("_")[:56] or "part"
        if not name[0].isalpha():
            name = f"part_{name}"
        base, k = name, 2
        while name in used:
            name, k = f"{base}_{k}", k + 1
        used.add(name)
        tx, ty, tz = _vec(p.position, 3, -20.0, 20.0, 0.0)
        rx, ry, rz = _vec(p.rotation_deg, 3, -360.0, 360.0, 0.0)
        parts.append(
            MeshPart(
                name=name,
                geometry=_geometry(p),
                rgba=_rgba(p.color, p.opacity),
                translation=(tx, ty, tz),
                rotation_deg=(rx, ry, rz),
            )
        )
        meta.append(
            {
                "name": name,
                "label": (p.label.strip() or name.replace("_", " "))[:200],
                "description": p.description.strip()[:1000],
            }
        )
    if not parts:
        raise ProviderPermanentError("The model design contained no parts.")
    title = re.sub(r"[^A-Za-z0-9 _-]", "", model.title)[:60] or "model"
    return write_glb(parts, scene_name=title, generator="edu3d llm_procedural"), meta


class LLMThreeDProvider:
    """Synchronous: the design call happens in create_task; results are cached per task id
    within the worker process (the job handler fetches them in the same invocation)."""

    name = "llm"
    _results: dict[str, tuple[bytes, list[dict[str, str]], LLMUsage]] = {}

    def __init__(
        self,
        llm: LLMProvider,
        max_output_tokens: int = 8000,
        *,
        system_prompt: str | None = None,
        prompt_ref: str | None = None,
    ) -> None:
        self.llm = llm
        self.max_output_tokens = max_output_tokens
        # Built-in design prompt, optionally preceded by the 3D model tuning (model_tuning.py).
        self.system_prompt = system_prompt or THREE_D_MODEL_DESIGN.system
        self.prompt_ref = prompt_ref or THREE_D_MODEL_DESIGN.ref

    def create_task(self, *, prompt: str, idempotency_key: str) -> ThreeDTask:
        task_id = "llm_" + hashlib.sha256(f"{idempotency_key}:{prompt}".encode()).hexdigest()[:20]
        if task_id not in self._results:
            result = self.llm.generate_structured(
                system_prompt=self.system_prompt,
                task=f"Teacher's request for an educational 3D model:\n{prompt}",
                references=[],
                output_schema=Model3DLLM,
                prompt_version=self.prompt_ref,
                max_output_tokens=self.max_output_tokens,
            )
            data, meta = convert_model(result.output)
            self._results[task_id] = (data, meta, result.usage)
        return self.get_task(task_id)

    def get_task(self, provider_task_id: str) -> ThreeDTask:
        cached = self._results.get(provider_task_id)
        if cached is None:
            return ThreeDTask(
                self.name,
                provider_task_id,
                ProviderTaskStatus.FAILED,
                error_code="Design result was lost; please generate again.",
            )
        _, meta, usage = cached
        return ThreeDTask(
            self.name,
            provider_task_id,
            ProviderTaskStatus.SUCCEEDED,
            llm_usage=usage,
            part_metadata=meta,
        )

    def fetch_output(self, task: ThreeDTask, max_bytes: int) -> bytes:
        cached = self._results.pop(task.provider_task_id, None)
        if cached is None:
            raise ProviderPermanentError("Design result was lost; please generate again.")
        if len(cached[0]) > max_bytes:
            raise ProviderPermanentError("The generated model exceeds the size limit.")
        return cached[0]


def describe(model: Any) -> str:  # pragma: no cover - debugging aid
    return ", ".join(p.name for p in model.parts)
