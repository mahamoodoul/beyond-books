import json
import struct

import pytest

from app.modules.three_d.demo_heart import build_heart_glb
from app.modules.three_d.glb import InvalidGLBError, inspect_glb, sanitize_node_name


def _glb(doc: dict, bin_chunk: bytes = b"") -> bytes:  # type: ignore[type-arg]
    js = json.dumps(doc).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js
    if bin_chunk:
        body += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


BASE = {
    "asset": {"version": "2.0"},
    "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
    "accessors": [{"count": 3, "componentType": 5126, "type": "VEC3"}],
    "nodes": [{"name": "Left Ventricle.001", "mesh": 0}],
}


def test_demo_heart_is_valid() -> None:
    data = build_heart_glb()
    info = inspect_glb(data, len(data))
    assert info.node_names == [
        "aorta",
        "left_atrium",
        "left_ventricle",
        "right_atrium",
        "right_ventricle",
    ]
    assert info.triangle_count > 0


def test_node_names_are_sanitized_like_threejs() -> None:
    assert sanitize_node_name("Left Ventricle.001") == "Left_Ventricle001"
    data = _glb(BASE)
    assert inspect_glb(data, len(data)).node_names == ["Left_Ventricle001"]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d["buffers"].__setitem__(0, {"uri": "https://evil.example/x.bin"}), "URIs"),
        (lambda d: d.__setitem__("images", [{"uri": "data:image/png;base64,AAAA"}]), "URIs"),
        (
            lambda d: d.__setitem__("extensionsRequired", ["KHR_draco_mesh_compression"]),
            "Unsupported",
        ),
        (lambda d: d["asset"].__setitem__("version", "1.0"), "2.0"),
        (lambda d: d.__setitem__("meshes", []), "no meshes"),
        (lambda d: d["accessors"][0].__setitem__("count", 30_000_000), "budget"),
    ],
)
def test_rejects_unsafe_or_oversized(mutate, message) -> None:  # type: ignore[no-untyped-def]
    doc = json.loads(json.dumps({**BASE, "buffers": [{"byteLength": 0}]}))
    mutate(doc)
    data = _glb(doc)
    with pytest.raises(InvalidGLBError, match=message):
        inspect_glb(data, len(data))


def test_rejects_non_glb_and_length_mismatch() -> None:
    with pytest.raises(InvalidGLBError):
        inspect_glb(b"PK\x03\x04" + b"\x00" * 40, 44)
    data = _glb(BASE)
    with pytest.raises(InvalidGLBError, match="length"):
        inspect_glb(data, len(data) + 10)
