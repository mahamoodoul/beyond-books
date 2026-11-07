# Edu3D AI

Turn textbooks into interactive 3D learning experiences.

**Full system design:** [README_Edu3D_AI_System_Design.md](README_Edu3D_AI_System_Design.md) — the
high-level source of truth.

**Status:** Phases 0–10 implemented on branch `shakil`, with interim decisions in ADRs 0004–0013
that the team still needs to confirm:

| Phase | What works |
|---|---|
| 1 Identity | Register/login (local provider), rotating refresh sessions, CSRF, rate limits, schools, classrooms, audit log |
| 2 Content | Courses, enrolment, PDF/text upload → extraction with page refs, chapters, objectives, versioned lessons with approve & publish |
| 3 AI | Outline proposals → teacher review/apply, grounded lesson generation, section regeneration, usage tracking, daily AI cap |
| 5 AI 3D | Scene planning agent (reuse model / procedural / suggest generation), library search, credit-capped generation jobs with polling (fake provider; Tripo/Meshy stubs pending verification) |
| 6 Animation | Guided animations (highlight, visibility, opacity, rotation, camera focus, paths, flow particles, annotations), published with the scene, play/pause/step controls, reduced motion, AI animation planning |
| 7 Students | Student dashboard with progress, course outline, lesson viewer (safe Markdown, source refs, 3D scenes with animations), mark complete / next lesson, allowlisted learning events, teacher progress table |
| 8 Assessments | Quiz builder (MCQ + rubric short answers), AI quiz generation, versioned publishing, attempts with limits, auto-graded MCQ, advisory AI short-answer feedback + teacher review queue, Explain Further with revision links |
| 9 Analytics | Course analytics (completion, quiz difficulty, common wrong answers, missing concepts), objective mastery + knowledge-gap records, rule-based insights, students needing attention, student self-insights with revision recommendations, small-group suppression |
| 10 Hardening | Security headers/CSP, per-IP rate limit, fail-closed prod config, readiness, JSON logs, Secrets Manager loading, GDPR export/delete, automated IDOR sweep, production images + release workflow, backups, runbooks, security review |
| 4 3D | GLB upload with validation + license metadata + review, 3D library, lesson scenes validated against model parts, procedural generators, R3F viewer with selectable parts and explanations |

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

Without Docker (backend tests and frontend need no services):

```bash
make backend-install && make backend-test
make frontend-install && make frontend-dev   # http://localhost:5173
```

API docs: http://localhost:8000/docs · Health: `GET /api/v1/health`

### Try the full teacher flow without Docker or an API key

```bash
cd backend
export EDU3D_DATABASE_URL=sqlite:///./dev.db EDU3D_JOBS_RUN_INLINE=true EDU3D_LLM_PROVIDER=fake
.venv/bin/alembic upgrade head && .venv/bin/python -m app.modules.three_d.seed
.venv/bin/uvicorn app.main:app --port 8000
# other terminal: make frontend-dev → register as teacher → create course → upload PDF →
# Generate outline → Apply → open chapter → Generate lesson with AI → review → Approve & publish
# → in the lesson: Add 3D scene → "Heart (schematic demo)" or a procedural scene → Preview
```

SQLite is for quick local runs and tests only; PostgreSQL is the real database.

## AI providers

LLM and 3D providers are pluggable: set `EDU3D_LLM_PROVIDER` (`fake` | `anthropic` | `openai`) and
`EDU3D_THREE_D_PROVIDER` (`fake` | `tripo` | `meshy`) plus that provider's key/model in
`backend/.env`. Default real LLM: Claude (`claude-opus-5-5`). To add a vendor see
[docs/ADDING_A_PROVIDER.md](docs/ADDING_A_PROVIDER.md).

## Operations

- Deployment: [docs/INFRASTRUCTURE_AND_DEPLOYMENT.md](docs/INFRASTRUCTURE_AND_DEPLOYMENT.md)
- Security review and open items before a real pilot: [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)
- Runbooks: [docs/RUNBOOKS.md](docs/RUNBOOKS.md)

## Contracts

| Contract | Canonical source | Generated |
|---|---|---|
| REST API | Pydantic models + FastAPI OpenAPI (`/api/v1/openapi.json`) | `frontend/src/api/generated/` (when domain endpoints land) |
| 3D scene / animation | `backend/app/modules/three_d/contracts.py` | `packages/three-d-contracts/schemas/*.json` → `frontend/src/features/three-d/schemas/generated/*.ts` |
| Async jobs | `backend/app/modules/operations/jobs.py` | — |

After changing a 3D contract run `make contracts`. CI fails if generated files are stale.

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) and the open decisions in [docs/adr/](docs/adr/README.md).
