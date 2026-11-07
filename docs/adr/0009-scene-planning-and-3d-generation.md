# ADR 0009: AI scene planning and 3D model generation jobs

- **Status:** Proposed — interim answer to open decision #5 (3D providers)
- **Date:** 2026-11-07

## Decision

**Scene planning** (`app/modules/ai_engine/scene_planning.py`)
- The planner sees the lesson (as untrusted excerpts) and a catalogue: approved models usable in
  this course (ranked by relevance, with their part lists) and the procedural generator registry.
- It must choose one of `reuse_asset`, `procedural`, `generate_asset`, `none`. Output is converted
  into a `SceneSpec` (unknown parts dropped, generator params clamped, unknown assets/generators
  rejected), then validated by `check_scene` and saved as a **draft** scene with `origin=ai` and
  the model's rationale.
- `generate_asset` only returns a suggestion. Generation spends provider credits, so a teacher
  must explicitly trigger it — search-before-generate (design §7.1, §13).

**Generation jobs** (`THREE_D_ASSET_GENERATION`)
- Provider task id is persisted before polling, so retries never create (and bill) a second task.
- Polling uses `PendingJobError` with its own budget (40 polls; 15 s apart in Celery).
- Output is size-limited, validated by the same GLB checks as uploads, stored as a new asset
  version with `review_status=pending` and license text pointing at the provider's terms.
- Credits are recorded in `ai_usage_records.credits_used`. Per-user daily cap
  (`EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY`, default 5).

**Providers**
- `FakeThreeDProvider` (default) produces a small multi-part GLB after one pending poll.
- `TripoProvider` / `MeshyProvider` exist only as stubs that fail with an explicit message.
  Implement them only after verifying current official API docs, output formats, commercial
  rights, pricing, rate limits and webhook support. Do not rely on unverified assumptions.

## Consequences

Generated models are not assumed accurate, segmented or rigged; teachers review them like uploads.
