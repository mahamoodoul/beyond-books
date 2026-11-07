# Beyond Books

Turn textbooks into interactive, chapter-based learning experiences with 3D models and assessments.

**Full system design:** [read the system design](README_Edu3D_AI_System_Design.md) — the
high-level source of truth.

The frontend demo runs without the separately developed backend; mock login lets you switch
between teacher and student views. The Beyond Books demo includes the Grade 8 Circulatory System
course, a student lesson and assessment, teacher upload/review, student progress, and class analytics.

## Repository layout

```text
backend/                   FastAPI modular monolith, Celery workers, Alembic migrations
  app/modules/<domain>/    One folder per domain module (design §5)
  app/integrations/        Provider adapters behind app/integrations/interfaces.py
frontend/                  React + TypeScript + Vite
  src/app/                 Router, role/theme providers, and application layout
  src/components/ui/       Shared interface components
  src/features/            Landing, courses, lessons, assessments, and dashboards
  src/lib/api.ts           Typed asynchronous mock service layer
  src/lib/mock/            Seed course, roster, progress, and analytics data
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

For frontend checks:

```bash
cd frontend && npm test && npm run build
```

For the full local stack, start the backend dependencies and services with Docker as shown above.

## Frontend mock data and API boundary

Feature components call the async functions in `frontend/src/lib/api.ts`; they should not import
seed data directly. The corresponding typed contracts live in `frontend/src/lib/types.ts`, and
seeded examples are kept in `frontend/src/lib/mock/`. To connect the backend, replace the mock
function bodies in `lib/api.ts` with HTTP requests while keeping their input and return types, then
update the API tests to cover the real response and error behavior.

The upload pipeline is a local demo: it simulates analysis and creates an editable draft in
in-memory storage. Uploaded PDFs are not sent to a server or retained across page reloads.

## Heart augmented reality

The Grade 8 Circulatory System lesson includes an image-tracked heart experience. Open a lesson
and choose **Start AR**, then point the camera at the linked heart tracking page. The page can be
opened on a second device or printed; the marker image and tracking data live in
`frontend/public/targets/`. The 3D heart model is in `frontend/public/models/heart.glb`.

Camera access requires a secure browser context (HTTPS in deployment; `localhost` is allowed for
local development) and camera permission. If the camera or WebGL is unavailable, the AR view
shows an actionable error and the lesson's regular interactive 3D model remains available.

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
