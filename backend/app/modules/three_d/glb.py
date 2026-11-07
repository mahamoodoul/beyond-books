"""Static validation of uploaded GLB (binary glTF 2.0) files (design §7.4, §10 step 9).

We never execute anything from a model file. Checks: container structure, glTF version, no
external or data URIs (everything must be embedded in the GLB), an allowlist of required
extensions, and polygon/size budgets. Node names are extracted (sanitized exactly like three.js
does) so scene specs can be validated against them.
"""

import json
import re
import struct
from dataclasses import dataclass, field
from typing import Any

GLB_MAGIC = b"glTF"
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942
MAX_JSON_BYTES = 8 * 1024 * 1024
MAX_NODES = 5000
MAX_MESHES = 2000
MAX_TRIANGLES = 1_500_000
MAX_TEXTURE_IMAGES = 64
ALLOWED_REQUIRED_EXTENSIONS = {
    "KHR_mesh_quantization",
    "KHR_texture_transform",
    "KHR_materials_emissive_strength",
    "KHR_materials_unlit",
}


class InvalidGLBError(Exception):
    pass


@dataclass
class GLBInfo:
    node_names: list[str]
    mesh_count: int
    triangle_count: int
    material_count: int
    image_count: int
    animation_names: list[str]
    extensions_used: list[str] = field(default_factory=list)

    def as_metadata(self) -> dict[str, Any]:
        return {
            "node_names": self.node_names,
            "mesh_count": self.mesh_count,
            "triangle_count": self.triangle_count,
            "material_count": self.material_count,
            "image_count": self.image_count,
            "animation_names": self.animation_names,
            "extensions_used": self.extensions_used,
        }


_RESERVED = re.compile(r"[\[\]\.:/]")
_WS = re.compile(r"\s")


def sanitize_node_name(name: str) -> str:
    """Mirror of three.js PropertyBinding.sanitizeNodeName (GLTFLoader Object3D names)."""
    return _RESERVED.sub("", _WS.sub("_", name))


def header_length(head: bytes) -> int:
    """Bytes needed to read the JSON chunk: 12-byte header + 8-byte chunk header + JSON."""
    if len(head) < 20 or head[:4] != GLB_MAGIC:
        raise InvalidGLBError("Not a GLB file.")
    json_len: int
    chunk_type: int
    json_len, chunk_type = struct.unpack_from("<II", head, 12)
    if chunk_type != CHUNK_JSON:
        raise InvalidGLBError("First GLB chunk must be JSON.")
    if json_len > MAX_JSON_BYTES:
        raise InvalidGLBError("GLB JSON chunk is too large.")
    return 20 + json_len


def inspect_glb(head: bytes, total_size: int) -> GLBInfo:
    """`head` must contain at least `header_length(head)` bytes."""
    needed = header_length(head)
    magic, version, length = struct.unpack_from("<4sII", head, 0)
    if version != 2:
        raise InvalidGLBError("Only glTF 2.0 GLB files are supported.")
    if length != total_size:
        raise InvalidGLBError("GLB length header does not match the file size.")
    if len(head) < needed:
        raise InvalidGLBError("Truncated GLB.")
    try:
        doc = json.loads(head[20:needed].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidGLBError("GLB JSON chunk is not valid JSON.") from exc
    if not isinstance(doc, dict) or doc.get("asset", {}).get("version") != "2.0":
        raise InvalidGLBError("Missing glTF asset version 2.0.")

    for kind in ("buffers", "images"):
        for item in doc.get(kind, []):
            if isinstance(item, dict) and "uri" in item:
                raise InvalidGLBError(
                    f"External or data URIs in {kind} are not allowed; embed all data in the GLB."
                )
    required = set(doc.get("extensionsRequired", []))
    unsupported = sorted(required - ALLOWED_REQUIRED_EXTENSIONS)
    if unsupported:
        raise InvalidGLBError(f"Unsupported required glTF extensions: {unsupported}")

    nodes = doc.get("nodes", [])
    meshes = doc.get("meshes", [])
    images = doc.get("images", [])
    if len(nodes) > MAX_NODES or len(meshes) > MAX_MESHES:
        raise InvalidGLBError("The model has too many nodes or meshes.")
    if len(images) > MAX_TEXTURE_IMAGES:
        raise InvalidGLBError("The model has too many textures.")
    if not meshes:
        raise InvalidGLBError("The model contains no meshes.")

    accessors = doc.get("accessors", [])
    triangles = 0
    for mesh in meshes:
        for prim in mesh.get("primitives", []):
            mode = prim.get("mode", 4)
            if mode != 4:
                continue
            idx = prim.get("indices")
            if isinstance(idx, int) and 0 <= idx < len(accessors):
                triangles += int(accessors[idx].get("count", 0)) // 3
            else:
                pos = prim.get("attributes", {}).get("POSITION")
                if isinstance(pos, int) and 0 <= pos < len(accessors):
                    triangles += int(accessors[pos].get("count", 0)) // 3
    if triangles > MAX_TRIANGLES:
        raise InvalidGLBError(
            f"The model has {triangles:,} triangles; the budget is {MAX_TRIANGLES:,}."
        )

    names = sorted(
        {sanitize_node_name(str(n["name"])) for n in nodes if isinstance(n, dict) and n.get("name")}
    )
    return GLBInfo(
        node_names=names[:MAX_NODES],
        mesh_count=len(meshes),
        triangle_count=triangles,
        material_count=len(doc.get("materials", [])),
        image_count=len(images),
        animation_names=[str(a.get("name", "")) for a in doc.get("animations", [])][:200],
        extensions_used=sorted(map(str, doc.get("extensionsUsed", []))),
    )
