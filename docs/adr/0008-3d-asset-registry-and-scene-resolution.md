# ADR 0008: 3D asset registry, review gate and scene resolution

- **Status:** Proposed — Phase 4; review with 3D (Dev 4), Backend (Dev 2) and Frontend (Dev 1)
- **Date:** 2026-11-07

## Decision

**Assets** (`three_d_assets`, `three_d_asset_versions`)
- Uploaded as GLB only (binary glTF 2.0) via presigned upload → `complete`, which validates the
  container, rejects any external/data URI (everything must be embedded), allowlists required
  extensions (no Draco/meshopt yet: the viewer has no decoders configured), and enforces budgets
  (≤30 MB, ≤1.5M triangles, ≤5000 nodes). Node names are stored sanitized exactly like three.js.
- License name, attribution and source URL are mandatory metadata; the viewer always shows them.
- Visibility: `private` (creator), `school` (school teachers), `library` (all teachers; seed/admin
  only). Only `approved` assets can be used in scenes; **every new version resets review to pending**.
- Review is done by the asset owner (or school admin) for the pilot. A dedicated reviewer role
  (e.g. medical review for anatomy) is future work.

**Scenes** (`three_d_scenes`)
- Spec stored as validated `SceneSpec` JSON; components live inside the spec (no separate
  components table yet). Draft `scene_spec` vs. `published_spec` snapshot, like lessons.
- Server-side validation on save and again at publish: asset approved and usable in this course,
  version ready, every component `mesh_name` exists in the asset's node names or is produced by an
  allowlisted procedural generator with in-range params.
- `GET /scenes/{id}/resolved` is the Scene Resolver: authorizes, re-validates, and returns
  short-lived signed URLs for exactly the referenced asset versions. Students only ever get the
  published snapshot of a published scene in a lesson they can see.

**Contract change (ADR 0003):** `SceneSpec.explanations` (map of id → text) added; every
`explanation_ref` must resolve. Schema version stays `1.0` (not yet frozen).

**Viewer:** React Three Fiber, lazy-loaded chunk; click or list selection with highlight,
explanation panel, license attribution, reduced-motion support, WebGL failure fallback,
GPU resource disposal on unmount.

## Placeholder content

`demo_heart_schematic` (seeded, CC0) is five ellipsoids — **not anatomically accurate**. It exists
only so the pipeline runs end to end. Open decision #7 (licensed, medically reviewed anatomy) still
applies before classroom use.
