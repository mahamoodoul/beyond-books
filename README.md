# Beyond Books

Turn textbooks into interactive, chapter-based learning experiences with 3D models and assessments.

**Full system design:** [README_Edu3D_AI_System_Design.md](README_Edu3D_AI_System_Design.md) — the
high-level source of truth.

The frontend demo uses typed seed data in `frontend/src/features/demo/`. It can be opened locally
without the separately developed backend; login lets you switch between teacher and student views.

## Repository layout

```text
backend/                   FastAPI modular monolith, Celery workers, Alembic migrations
  app/modules/<domain>/    One folder per domain module (design §5)
  app/integrations/        Provider adapters behind app/integrations/interfaces.py
frontend/                  React + TypeScript + Vite + Tailwind
packages/three-d-contracts Generated JSON Schema + fixtures for scene/animation specs
infrastructure/docker/     Dockerfiles for local development
scripts/                   Repo tooling (contract export)
docs/adr/                  Architecture Decision Records
```

## Quick start

With Docker:

```bash
cp .env.example .env
make up            # postgres+pgvector, redis, api :8000, worker, frontend :5173
```

Frontend only (mock data; no backend services required):

```bash
cd frontend && npm ci && npm run dev         # http://localhost:5173
```

For the full local stack, start the backend dependencies and services with Docker as shown above.

API docs: http://localhost:8000/docs · Health: `GET /api/v1/health`

## Contracts

| Contract | Canonical source | Generated |
|---|---|---|
| REST API | Pydantic models + FastAPI OpenAPI (`/api/v1/openapi.json`) | `frontend/src/api/generated/` (when domain endpoints land) |
| 3D scene / animation | `backend/app/modules/three_d/contracts.py` | `packages/three-d-contracts/schemas/*.json` → `frontend/src/features/three-d/schemas/generated/*.ts` |
| Async jobs | `backend/app/modules/operations/jobs.py` | — |

After changing a 3D contract run `make contracts`. CI fails if generated files are stale.

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) and the open decisions in [docs/adr/](docs/adr/README.md).
