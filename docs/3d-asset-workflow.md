# 3D asset workflow

How a 3D file gets from "this lesson needs a model" to something the renderer can load safely.
Implements design §7 (strategies, scene spec, asset metadata, performance) and
[ADR 0003](adr/0003-declarative-scene-and-animation-contracts.md). Owner: Developer 4 (3D).

> **Status:** proposal. The budgets, review states and naming rules below need team sign-off
> before the Phase 4 contract freeze.

## The one rule that makes everything work

**Every selectable component is one named node in the GLB, and that node name is the scene's
`mesh_name`.** The AI scene planner, the asset registry and the React Three Fiber resolver all meet
at this name. If it doesn't match, the component can't be clicked, highlighted or animated.

## Pipeline

```text
1 Plan  →  2 Source  →  3 Prepare  →  4 Optimize  →  5 Validate  →  6 Register  →  7 Review  →  8 Use
lesson     A/B/C       name, pivot,    compress,      script +        metadata +     expert/      scene
concepts   strategy    units, paths    budgets        glTF validator  S3 upload      teacher      spec
```

### 1. Plan: write the component list first

Before modelling anything, list the components that the lesson's learning objectives need students
to select, label or animate. That list becomes the node names and the `components` of the scene
spec. Example for the heart: `right_atrium, right_ventricle, left_atrium, left_ventricle, aorta,
pulmonary_trunk, superior_vena_cava, inferior_vena_cava, pulmonary_veins`.

Also list any **paths** the animations need (blood flow, electron flow, orbit), since
`show_flow_particles` and `move_along_path` take a `path_id`.

### 2. Source: choose a strategy (design §7.1)

| Strategy | Use for | How |
|---|---|---|
| **A. Procedural** | Geometry, orbits, simple molecules, physics demos | Either a renderer `generator` (no file at all, e.g. `scene_solar_system_01`) or a scripted GLB built from primitives (`scripts/build_demo_assets.py`) |
| **C. Reviewed library** (default for anatomy/biology) | Organs, skeletons, cells, machinery | Licensed model (e.g. a medically reviewed anatomy set) → Blender to split and name parts |
| **B. AI-generated** (Tripo/Meshy, Phase 5) | When A and C have nothing suitable | Provider adapter job → download → **always** goes through steps 3–7; output is rarely segmented, so expect Blender work |

Search the registry for an approved asset before creating a new one (design principle 4).

### 3. Prepare (usually Blender 4.x)

- **Naming:** `snake_case`, matching `^[a-z][a-z0-9_]{0,63}$` (same as the contract's
  `Identifier`), so `component_id == mesh_name` works without mapping.
- **One node per selectable component.** Merge everything else (decorative or never clicked)
  into a few nodes to keep draw calls low. Repeated parts that are selected as a group (e.g. all
  chloroplasts) become one merged node.
- **Pivots:** set each node's origin to the component's centre so `rotate_component` and
  `camera_focus` behave. Then *Apply Rotation & Scale*; keep only translation on component nodes
  (the validator enforces this).
- **Units and orientation:** metres or a documented unit in metadata (`units`), +Y up, the subject
  facing +Z (front/anterior view), centred near the origin.
- **Materials:** glTF PBR metallic-roughness only; use textbook colour conventions where they exist
  (e.g. red = oxygen-rich, blue = oxygen-poor; CPK colours for atoms).
- **Paths:** draw a curve per path and export its points into the asset metadata `paths`, in the
  same coordinate space as the GLB. Don't put them in the GLB.
- **Export:** glTF Binary (`.glb`), selected objects only, +Y up, apply modifiers; no cameras,
  lights or animations (animations are our declarative specs, not baked clips).

### 4. Optimize

Use [`gltf-transform`](https://gltf-transform.dev) (`npm i -g @gltf-transform/cli`):

```bash
gltf-transform dedup in.glb tmp.glb
gltf-transform weld tmp.glb tmp.glb
gltf-transform meshopt tmp.glb out.glb        # geometry compression
gltf-transform resize --width 2048 --height 2048 out.glb out.glb
```

Don't use `join`/`flatten`/`simplify` on the whole file: they can merge or rename the nodes the
scene depends on. Compression (`meshopt`, Draco, KTX2) needs matching decoders in the renderer;
agree that in an ADR before turning it on.

**Proposed budgets per asset** (enforced in `scripts/validate_asset.py`): ≤ 3M triangles and
≤ 64 MB (raised from 150k / 15 MB for high-detail Blender assets; needs team sign-off and testing
on student devices and school networks — prefer the lightest variant that teaches the concept), textures ≤ 2048². For a full-body anatomy scene, apply the budget per body system and
load systems lazily (design §7.7).

### 5. Validate

```bash
python scripts/validate_asset.py packages/demo-assets/metadata/<asset_id>.json \
  --scene  packages/three-d-contracts/fixtures/<scene>.json \
  --animation packages/three-d-contracts/fixtures/<animation>.json \
  --preview packages/demo-assets/previews/<asset_id>.png
```

It checks the GLB header, that everything is embedded (no external or data URIs), that mesh
nodes are named, that component nodes carry no rotation/scale, the budgets, that the metadata
hash/size/triangle count match the file, that every scene `mesh_name` exists, that the scenes and
animations pass the Pydantic contracts, that animation targets exist, and that every `path_id`
exists in the metadata. It also renders a PNG thumbnail directly from the GLB buffers.

Also run the Khronos [glTF-Validator](https://github.khronos.org/glTF-Validator/) and open the file
in a [glTF viewer](https://gltf-viewer.donmccurdy.com) once by eye.

### 6. Register

Write the asset-registry record (design §7.4), e.g.
[`human_heart_v1.json`](../packages/demo-assets/metadata/human_heart_v1.json): `asset_id`,
`version`, `object_key`, `preview_key`, `content_hash`, `size_bytes`, `triangle_count`, `units`,
`components`, `supported_interactions`, `animation_capabilities`, `paths`, `provider`, `license`,
`review_status`, `accuracy_note`. In Phase 2+ the GLB goes to private S3 under `object_key`; the
browser receives a short-lived signed URL from the scene resolver, never a URL from scene JSON.

**Versions are immutable.** Changing geometry or node names means `version + 1`; published scenes
keep pointing at the version they were approved with.

### 7. Review

`review_status`: `draft_unreviewed` → `content_reviewed` (subject expert checked accuracy) →
`approved` (teacher may publish) → `deprecated`. Only `approved` assets can appear in published
lessons. Anatomy needs a medically reviewed source *before* review starts (design §7.5, §22.7).

### 8. Use

The scene planner (Phase 5) only sees approved assets' `components`, `supported_interactions`,
`animation_capabilities` and `paths`, so it can only plan what the asset can actually do.

## Demo assets in this repo

Built by `scripts/build_demo_assets.py`, checked by `scripts/check_demo_assets.sh`.

| Asset | Meshes | Tris | Scenes / animations |
|---|---|---|---|
| `human_heart_v1` | 4 chambers, aorta, pulmonary trunk, venae cavae, pulmonary veins + 2 flow paths | 20.7k | `scene_heart_01` + `blood_flow_01` (existing), `scene_heart_02` + `double_circulation_01` |
| `plant_cell_v1` | wall, membrane, vacuole, nucleus, chloroplasts, mitochondria | 10.2k | `scene_plant_cell_01` + `plant_cell_tour_01` |
| `plant_cell_v2` | 12 parts incl. ER, Golgi, ribosomes, peroxisomes, cytoskeleton; authored explode offsets + label anchors. Modelled in Blender (`source/plant_cell_v2.blend`), metadata from `scripts/write_asset_metadata.py` | 495.0k | `scene_plant_cell_02` + `plant_cell_tour_01` |
| `plant_cell_v3` | Same model as v2 at high detail (export profile `v3` in the .blend's `export_web.py`), 58.7 MB uncompressed, **not committed** (gitignored; run `export("v3")` in Blender to create it locally) | 2.53M | `scene_plant_cell_03` + `plant_cell_tour_01` |
| `water_molecule_v1` | O, 2×H, 2 bonds (O–H 0.958 Å, 104.45°) | 4.2k | `scene_water_molecule_01` + `water_shape_01` |

They are **schematic placeholders** (`review_status: draft_unreviewed`,
`allowed_use: development_and_demo_only`) for the Phase 4 viewer and resolver. The heart and cell
are built from primitives and are not anatomically or botanically accurate. Replace them with
reviewed, licensed models before any student sees them.
