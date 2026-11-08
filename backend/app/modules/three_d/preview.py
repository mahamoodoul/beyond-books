"""2D picture of a 3D model: a PNG rendered on the server from the GLB, with no GPU, no browser
and no extra libraries (pure Python + zlib).

Used as the model's thumbnail in the library and Studio, as the poster while the 3D viewer
loads, and as the fallback on devices that cannot run 3D smoothly.

The renderer reads the scene's node hierarchy (TRS or matrix), triangle meshes (float or
quantised positions, optional normals), and each material's base colour and alpha. It frames
the model from the same three-quarter angle as the viewer's default camera, lights it with a
key light, a fill light and ambient light, rasterises with a depth buffer at 2x resolution
(Gouraud shading, semi-transparent parts blended back to front), and downsamples for smooth
edges. The background is transparent so the picture sits on any page colour.

Textures are not sampled (generated models are coloured by material); very large models are
sampled down to MAX_TRIANGLES so a render stays within a few seconds.
"""

from __future__ import annotations

import json
import logging
import math
import struct
import time
import zlib
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

WIDTH = 640
HEIGHT = 480
SSAA = 2
MAX_TRIANGLES = 120_000
PREVIEW_MIME = "image/png"

_COMPONENT = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
_NORMALIZE = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
_TYPE_SIZE = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

Vec = tuple[float, float, float]
Mat = list[float]  # 4x4 column-major, as in glTF


class PreviewError(Exception):
    pass


def preview_key(model_key: str) -> str:
    """Storage key of the picture next to the model: .../v1/model.glb -> .../v1/preview.png."""
    head, _, _ = model_key.rpartition("/")
    return f"{head}/preview.png" if head else "preview.png"


# ---------------------------------------------------------------- GLB reading
def _split_glb(data: bytes) -> tuple[dict[str, Any], bytes]:
    if len(data) < 20 or data[:4] != b"glTF":
        raise PreviewError("Not a GLB file.")
    offset, js, binary = 12, None, b""
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + length]
        if kind == 0x4E4F534A:
            js = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if js is None:
        raise PreviewError("GLB has no JSON chunk.")
    return js, binary


def _accessor(gltf: dict[str, Any], binary: bytes, index: int) -> list[tuple[float, ...]]:
    acc = gltf["accessors"][index]
    if "bufferView" not in acc:
        return [(0.0,) * _TYPE_SIZE[acc["type"]]] * acc["count"]
    view = gltf["bufferViews"][acc["bufferView"]]
    fmt, size = _COMPONENT[acc["componentType"]]
    n = _TYPE_SIZE[acc["type"]]
    stride = view.get("byteStride") or size * n
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    if stride == size * n:
        flat = struct.unpack_from(f"<{count * n}{fmt}", binary, base)
        rows = [flat[i : i + n] for i in range(0, count * n, n)]
    else:
        rows = [struct.unpack_from(f"<{n}{fmt}", binary, base + i * stride) for i in range(count)]
    if acc.get("normalized") and acc["componentType"] in _NORMALIZE:
        d = _NORMALIZE[acc["componentType"]]
        rows = [tuple(max(-1.0, c / d) for c in r) for r in rows]
    return rows


def _mat_mul(a: Mat, b: Mat) -> Mat:
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


def _node_matrix(node: dict[str, Any]) -> Mat:
    if "matrix" in node:
        return [float(x) for x in node["matrix"]]
    tx, ty, tz = node.get("translation", (0, 0, 0))
    qx, qy, qz, qw = node.get("rotation", (0, 0, 0, 1))
    sx, sy, sz = node.get("scale", (1, 1, 1))
    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz, wx, wy, wz = qx * qy, qx * qz, qy * qz, qw * qx, qw * qy, qw * qz
    return [
        (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
        2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
        2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
    ]  # fmt: skip


def _apply(m: Mat, p: tuple[float, ...]) -> Vec:
    x, y, z = p[0], p[1], p[2]
    return (
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    )


def _apply_dir(m: Mat, d: tuple[float, ...]) -> Vec:
    x, y, z = d[0], d[1], d[2]
    v = (
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
    )
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / n, v[1] / n, v[2] / n)


@dataclass
class _Tri:
    p: tuple[Vec, Vec, Vec]
    n: tuple[Vec, Vec, Vec] | None
    rgb: Vec  # linear
    alpha: float
    unlit: bool


def _triangles(gltf: dict[str, Any], binary: bytes) -> list[_Tri]:
    materials = gltf.get("materials", [])
    out: list[_Tri] = []

    def material(i: int | None) -> tuple[Vec, float, bool]:
        if i is None or i >= len(materials):
            return (0.8, 0.8, 0.8), 1.0, False
        m = materials[i]
        r, g, b, a = m.get("pbrMetallicRoughness", {}).get("baseColorFactor", (0.8, 0.8, 0.8, 1))
        e = m.get("emissiveFactor", (0, 0, 0))
        unlit = "KHR_materials_unlit" in m.get("extensions", {})
        alpha = a if m.get("alphaMode") == "BLEND" else 1.0
        return (
            (min(1, r + e[0] * 0.5), min(1, g + e[1] * 0.5), min(1, b + e[2] * 0.5)),
            alpha,
            unlit,
        )

    def walk(node_index: int, parent: Mat) -> None:
        node = gltf["nodes"][node_index]
        world = _mat_mul(parent, _node_matrix(node))
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]].get("primitives", []):
                if prim.get("mode", 4) != 4 or "POSITION" not in prim["attributes"]:
                    continue
                pos = [
                    _apply(world, p)
                    for p in _accessor(gltf, binary, prim["attributes"]["POSITION"])
                ]
                nrm = None
                if "NORMAL" in prim["attributes"]:
                    nrm = [
                        _apply_dir(world, n)
                        for n in _accessor(gltf, binary, prim["attributes"]["NORMAL"])
                    ]
                idx = (
                    [int(i[0]) for i in _accessor(gltf, binary, prim["indices"])]
                    if "indices" in prim
                    else list(range(len(pos)))
                )
                rgb, alpha, unlit = material(prim.get("material"))
                for t in range(0, len(idx) - 2, 3):
                    a, b, c = idx[t], idx[t + 1], idx[t + 2]
                    out.append(
                        _Tri(
                            (pos[a], pos[b], pos[c]),
                            (nrm[a], nrm[b], nrm[c]) if nrm else None,
                            rgb,
                            alpha,
                            unlit,
                        )
                    )
        for child in node.get("children", []):
            walk(child, world)

    identity: Mat = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
    scenes = gltf.get("scenes") or [{"nodes": list(range(len(gltf.get("nodes", []))))}]
    for root in scenes[gltf.get("scene", 0)].get("nodes", []):
        walk(root, identity)
    return out


# ------------------------------------------------------------------ rendering
def _norm(v: Vec) -> Vec:
    n = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1.0
    return (v[0] / n, v[1] / n, v[2] / n)


def _cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _srgb(c: float) -> float:
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


KEY = _norm((0.5, 0.8, 0.6))
FILL = _norm((-0.7, 0.2, -0.4))


def _shade(n: Vec, rgb: Vec, unlit: bool, view: Vec) -> tuple[float, float, float]:
    if unlit:
        return (_srgb(rgb[0]), _srgb(rgb[1]), _srgb(rgb[2]))
    if _dot(n, view) < 0:  # back side of a double-sided surface: light it from the front
        n = (-n[0], -n[1], -n[2])
    d = 0.32 + 0.78 * max(0.0, _dot(n, KEY)) + 0.25 * max(0.0, _dot(n, FILL))
    h = _norm((KEY[0] + view[0], KEY[1] + view[1], KEY[2] + view[2]))
    spec = 0.18 * max(0.0, _dot(n, h)) ** 24
    return (_srgb(rgb[0] * d + spec), _srgb(rgb[1] * d + spec), _srgb(rgb[2] * d + spec))


def render_png(data: bytes, width: int = WIDTH, height: int = HEIGHT) -> bytes:
    """Render a GLB to a PNG (RGBA, transparent background). Raises PreviewError."""
    gltf, binary = _split_glb(data)
    tris = _triangles(gltf, binary)
    if not tris:
        raise PreviewError("The model has no triangles to draw.")
    if len(tris) > MAX_TRIANGLES:  # keep big models within a few seconds
        step = len(tris) / MAX_TRIANGLES
        tris = [tris[int(i * step)] for i in range(MAX_TRIANGLES)]

    # frame the bounding sphere from the viewer's default three-quarter angle
    xs = [p[0] for t in tris for p in t.p]
    ys = [p[1] for t in tris for p in t.p]
    zs = [p[2] for t in tris for p in t.p]
    center = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
    radius = max(1e-6, math.dist((min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))) / 2)
    fov = math.radians(35)
    view_dir = _norm((1.0, 0.55, 1.25))  # from the model toward the camera
    dist = radius / math.sin(fov / 2) * 1.04
    eye = (
        center[0] + view_dir[0] * dist,
        center[1] + view_dir[1] * dist,
        center[2] + view_dir[2] * dist,
    )
    fwd = _norm((center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]))
    right = _norm(_cross(fwd, (0.0, 1.0, 0.0)))
    up = _cross(right, fwd)

    sw, sh = width * SSAA, height * SSAA
    f = (sh / 2) / math.tan(fov / 2)
    cx, cy = sw / 2, sh / 2

    def project(p: Vec) -> tuple[float, float, float]:
        d = (p[0] - eye[0], p[1] - eye[1], p[2] - eye[2])
        z = _dot(d, fwd)
        z = max(z, 1e-6)
        return (cx + f * _dot(d, right) / z, cy - f * _dot(d, up) / z, z)

    # tighten the framing to the model's real outline on screen (8 % margin)
    pts = [project(q) for t in tris[:: max(1, len(tris) // 4000)] for q in t.p]
    lo_x, hi_x = min(q[0] for q in pts), max(q[0] for q in pts)
    lo_y, hi_y = min(q[1] for q in pts), max(q[1] for q in pts)
    zoom = min(sw * 0.84 / max(1e-6, hi_x - lo_x), sh * 0.84 / max(1e-6, hi_y - lo_y))
    f *= zoom
    cx = sw / 2 - ((lo_x + hi_x) / 2 - sw / 2) * zoom
    cy = sh / 2 - ((lo_y + hi_y) / 2 - sh / 2) * zoom

    zbuf = [math.inf] * (sw * sh)
    rbuf = [0.0] * (sw * sh)
    gbuf = [0.0] * (sw * sh)
    bbuf = [0.0] * (sw * sh)
    abuf = [0.0] * (sw * sh)
    to_cam = (-fwd[0], -fwd[1], -fwd[2])

    def raster(t: _Tri, blend: bool) -> None:
        (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = (project(p) for p in t.p)
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            return
        face = _norm(_cross(
            (t.p[1][0] - t.p[0][0], t.p[1][1] - t.p[0][1], t.p[1][2] - t.p[0][2]),
            (t.p[2][0] - t.p[0][0], t.p[2][1] - t.p[0][1], t.p[2][2] - t.p[0][2]),
        ))  # fmt: skip
        normals = t.n or (face, face, face)
        c0, c1, c2 = (_shade(n, t.rgb, t.unlit, to_cam) for n in normals)
        minx, maxx = max(0, int(min(x0, x1, x2))), min(sw - 1, int(max(x0, x1, x2)) + 1)
        miny, maxy = max(0, int(min(y0, y1, y2))), min(sh - 1, int(max(y0, y1, y2)) + 1)
        if minx > maxx or miny > maxy:
            return
        inv = 1.0 / area
        alpha = t.alpha
        for py in range(miny, maxy + 1):
            sy = py + 0.5
            row = py * sw
            for px in range(minx, maxx + 1):
                sx = px + 0.5
                w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv
                if w0 < 0:
                    continue
                w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv
                if w1 < 0:
                    continue
                w2 = 1.0 - w0 - w1
                if w2 < 0:
                    continue
                z = w0 * z0 + w1 * z1 + w2 * z2
                i = row + px
                if z >= zbuf[i]:
                    continue
                r = w0 * c0[0] + w1 * c1[0] + w2 * c2[0]
                g = w0 * c0[1] + w1 * c1[1] + w2 * c2[1]
                b = w0 * c0[2] + w1 * c1[2] + w2 * c2[2]
                if blend:
                    k = 1 - alpha
                    rbuf[i] = r * alpha + rbuf[i] * k
                    gbuf[i] = g * alpha + gbuf[i] * k
                    bbuf[i] = b * alpha + bbuf[i] * k
                    abuf[i] = alpha + abuf[i] * k
                else:
                    zbuf[i] = z
                    rbuf[i], gbuf[i], bbuf[i], abuf[i] = r, g, b, 1.0

    def depth(t: _Tri) -> float:
        c = ((t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3,
             (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3)  # fmt: skip
        return _dot((c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]), fwd)

    started = time.monotonic()
    for t in tris:
        if t.alpha >= 0.98:
            raster(t, False)
    for t in sorted((t for t in tris if t.alpha < 0.98), key=depth, reverse=True):
        raster(t, True)

    # downsample SSAA x SSAA blocks (premultiplied), write RGBA rows
    rows = bytearray()
    n = SSAA * SSAA
    for y in range(height):
        rows.append(0)  # PNG filter: none
        for x in range(width):
            r = g = b = a = 0.0
            for dy in range(SSAA):
                base = (y * SSAA + dy) * sw + x * SSAA
                for dx in range(SSAA):
                    i = base + dx
                    ai = abuf[i]
                    r += rbuf[i] * ai
                    g += gbuf[i] * ai
                    b += bbuf[i] * ai
                    a += ai
            if a > 0:
                rows += bytes(
                    (
                        int(r / a * 255 + 0.5),
                        int(g / a * 255 + 0.5),
                        int(b / a * 255 + 0.5),
                        int(a / n * 255 + 0.5),
                    )
                )
            else:
                rows += b"\x00\x00\x00\x00"
    log.debug("preview: %d triangles in %.1f s", len(tris), time.monotonic() - started)
    return _png(width, height, bytes(rows))


def _png(width: int, height: int, raw: bytes) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload))
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


# ------------------------------------------------------------- storage glue
def store_preview(version: Any, data: bytes) -> str | None:
    """Render the picture for a model version, store it next to the model and record its key in
    the version's metadata. Best effort: a model that cannot be drawn keeps working without one."""
    from app.integrations.storage import get_storage

    started = time.monotonic()
    try:
        png = render_png(data)
    except Exception as exc:  # never fail an upload or a generation because of the picture
        log.warning("preview: could not render %s: %s", version.storage_key, exc)
        return None
    key = preview_key(version.storage_key)
    get_storage().put_bytes(key, png, PREVIEW_MIME)
    version.metadata_json = {
        **(version.metadata_json or {}),
        "preview_key": key,
        "preview_size": [WIDTH, HEIGHT],
    }
    log.info("preview: %s rendered in %.1f s", key, time.monotonic() - started)
    return key


def preview_url(version: Any) -> str | None:
    """A short-lived download URL for the version's picture, or None when it has none."""
    key = (version.metadata_json or {}).get("preview_key") if version is not None else None
    if not key:
        return None
    from app.core.config import get_settings
    from app.integrations.storage import get_storage

    return get_storage().presigned_download(
        key=key, content_type=PREVIEW_MIME, expires_in_s=get_settings().download_url_ttl_s
    )


def backfill_previews(db: Any, *, force: bool = False) -> dict[str, int]:
    """Render pictures for every ready model version that has none (or all, with force).
    Returns counts: rendered, skipped, failed."""
    from sqlalchemy import select

    from app.integrations.storage import get_storage
    from app.modules.three_d.models import ThreeDAssetVersion

    storage = get_storage()
    counts = {"rendered": 0, "skipped": 0, "failed": 0}
    for v in db.scalars(select(ThreeDAssetVersion).where(ThreeDAssetVersion.status == "ready")):
        key = (v.metadata_json or {}).get("preview_key")
        if key and not force and storage.head(key) is not None:
            counts["skipped"] += 1
            continue
        if storage.head(v.storage_key) is None:
            counts["failed"] += 1
            log.warning("preview: model file missing for %s", v.storage_key)
            continue
        if store_preview(v, storage.read_bytes(v.storage_key, v.file_size_bytes)):
            counts["rendered"] += 1
            db.commit()
        else:
            counts["failed"] += 1
    return counts
