# ADR 0003: Declarative, versioned scene and animation contracts

- **Status:** Proposed — needs review by AI (Dev 3), 3D (Dev 4) and Backend (Dev 2) before the
  Phase 4 contract freeze
- **Date:** 2026-11-07

## Context

LLMs plan 3D scenes and animations. They must never produce executable code (design §6.4, §7.2).

## Decision

- Pydantic models in `backend/app/modules/three_d/contracts.py` are canonical; JSON Schema and
  TypeScript types are generated from them and checked in CI.
- `extra="forbid"` on every object; identifiers are constrained slugs; actions are enumerations.
- Animation steps are a discriminated union on `action`; each action carries only its own bounded
  parameters; step duration ≤ 30 s; steps are numbered 1..n.
- `validate_animation_for_scene` rejects animations whose targets are not scene components.

### Proposals beyond the design document (please review)

| Item | Proposal |
|---|---|
| Procedural scenes | `procedural: [{generator, params}]`, generator from a renderer allowlist, flat scalar params |
| `set_visibility` | `visible: bool` |
| `set_opacity` | `opacity: 0..1` |
| `rotate_component` | `axis: x/y/z`, `degrees: -720..720` |
| `move_along_path`, `show_flow_particles` | `path_id` referencing a path defined in asset metadata |
| `show_annotation` | target optional; `explanation` required |
| Component actions | `highlight`, `show_explanation`, `toggle_visibility`, `focus_camera` |
| Camera presets | `front`, `side`, `top`, `three_quarter` |

## Consequences

Adding an action requires a schema version bump decision, a renderer implementation and an ADR.
