# Contributing

Rules from design §14.3–14.4.

## Workflow

- Short-lived feature branches → pull request → CI green → review → merge. No direct pushes to `main`.
- Keep PRs small. Update docs in the same PR.
- Shared contract changes (REST schemas, `three_d/contracts.py`, job lifecycle) need review from every
  affected owner. After a contract freeze point, changes also need an ADR.
- One designated migration owner merges schema migrations.

## Ownership

| Area | Owner |
|---|---|
| `frontend/` (except 3D runtime) | Developer 1 — Frontend/UX |
| `backend/` core modules, migrations, REST contracts | Developer 2 — Backend/DB |
| `backend/app/modules/ai_engine`, LLM integrations, prompts | Developer 3 — AI |
| `frontend/src/features/three-d`, `three_d`/`animations` modules, 3D contracts, Tripo/Meshy adapters | Developer 4 — 3D |

The AI team does not implement rendering; the 3D team does not own educational prompts.

## Definition of done

Acceptance criteria pass · authorization tested · loading/empty/error states exist · tests pass ·
API/schema docs updated · migrations included if needed · no secrets in logs · merged to `main`.

## Backend conventions

- Routes → services → repositories / provider interfaces. No business logic in route handlers.
- Workers call application services, not repositories directly.
- Raise `AppError` subclasses from services; the error envelope is applied centrally.
- Business logic depends on `app/integrations/interfaces.py`, never on vendor SDK types.
- Never execute LLM output. LLM output is validated against Pydantic schemas.
