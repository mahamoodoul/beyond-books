# three-d-contracts

The critical contract between the AI scene planner, the backend asset registry and the frontend
renderer (design §24).

- `schemas/` — **generated** JSON Schema (draft 2020-12). Do not edit by hand.
  Source: `backend/app/modules/three_d/contracts.py`. Regenerate with `make contracts`.
- `fixtures/` — valid example documents used by backend tests and as viewer fixtures in Phase 4.

## Safety properties

- Unknown fields are rejected — no URLs, scripts or arbitrary properties.
- Assets are referenced by `asset_id` + `version`, resolved against the approved asset registry.
- Component and animation actions are closed enumerations; animation steps are a discriminated union
  on `action`, each with its own bounded parameters.
- Animation targets must exist in the scene (`validate_animation_for_scene`).
- Procedural scenes name an allowlisted renderer `generator` with flat scalar params only.

Action parameters beyond the design's examples (`path_id`, `axis`/`degrees`, `opacity`, `visible`,
`procedural`) are proposals — see [ADR 0003](../../docs/adr/0003-declarative-scene-and-animation-contracts.md).
