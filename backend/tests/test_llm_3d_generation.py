from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.integrations.interfaces import ProviderPermanentError
from app.integrations.three_d.llm_procedural import convert_model
from app.modules.ai_engine.schemas import Model3DLLM, ModelPartLLM
from app.modules.three_d.glb import inspect_glb

Login = Callable[..., TestClient]


def _part(**kw: Any) -> ModelPartLLM:
    base: dict[str, Any] = {
        "name": "nucleus",
        "label": "Nucleus",
        "shape": "sphere",
        "size": [0.4],
        "position": [0, 0, 0],
        "rotation_deg": [],
        "color": "#cc4444",
        "opacity": 1,
        "description": "Holds DNA.",
    }
    return ModelPartLLM(**{**base, **kw})


def test_convert_model_builds_valid_glb_and_sanitises() -> None:
    model = Model3DLLM(
        title="Plant cell!",
        parts=[
            _part(),
            _part(name="Nucleus", shape="box", size=[1, 1, 1]),  # duplicate name
            _part(name="9 wall", shape="torus", size=[5, 50, 0], color="red", opacity=-3),
            _part(name="vac", shape="capsule", size=[99, 0.5], position=[1e9, float("nan"), 0]),
            _part(name="cone", shape="cone", size=[0.3, 0.6], rotation_deg=[90, 0, 0]),
            _part(name="tube", shape="cylinder", size=[0.1, 2]),
            _part(name="oval", shape="ellipsoid", size=[0.5, 0.2, 0.3]),
        ],
    )
    data, meta = convert_model(model)
    info = inspect_glb(data, len(data))
    assert [m["name"] for m in meta] == [
        "nucleus",
        "nucleus_2",
        "part_9_wall",
        "vac",
        "cone",
        "tube",
        "oval",
    ]
    assert sorted(info.node_names) == sorted(m["name"] for m in meta)
    assert meta[0] == {"name": "nucleus", "label": "Nucleus", "description": "Holds DNA."}


def test_convert_model_rejects_empty() -> None:
    with pytest.raises(ProviderPermanentError):
        convert_model(Model3DLLM(title="x", parts=[]))


def test_providers_endpoint_lists_configured_only(login: Login) -> None:
    t = login("t@example.com")
    names = {p["name"]: p for p in t.get("/api/v1/three-d/providers").json()}
    assert {"fake", "llm"} <= set(names) and "tripo" not in names  # tripo has no key
    assert names["fake"]["is_default"] is True
    assert login("s@example.com", "student").get("/api/v1/three-d/providers").status_code == 403


def test_llm_generation_end_to_end_with_parts_metadata(login: Login) -> None:
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={
            "name": "Plant cell",
            "prompt": "A plant cell with nucleus and chloroplast",
            "provider": "llm",
        },
    )
    assert r.status_code == 202, r.text
    job = t.get(f"/api/v1/jobs/{r.json()['job_id']}").json()
    assert job["status"] == "completed", job
    asset = t.get(f"/api/v1/assets/{r.json()['asset']['id']}").json()
    assert asset["provider"] == "llm" and asset["review_status"] == "pending"
    meta = asset["versions"][0]["metadata_json"]
    parts = {p["name"]: p for p in meta["parts"]}
    assert "body" in parts and all(p["description"] for p in parts.values())
    assert set(parts) == set(meta["node_names"])


def test_unknown_provider_rejected(login: Login) -> None:
    t = login("t@example.com")
    r = t.post(
        "/api/v1/assets/generation-jobs",
        json={"name": "X", "prompt": "A simple cube model", "provider": "nope"},
    )
    assert r.status_code == 400
    assert t.get("/api/v1/assets").json() == []
