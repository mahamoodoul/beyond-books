# Beyond Books

Turn textbooks into interactive, chapter-based learning experiences with 3D models and assessments.

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

**Full system design:** [read the system design](README_Edu3D_AI_System_Design.md) — the
high-level source of truth.

The Beyond Books frontend is connected to the FastAPI backend. Sign in with a real teacher or
student account; account roles and access are checked by the server. Course creation, source
uploads and extraction, AI outlines and lessons, 3D model generation and review, assessments,
student progress, and class analytics use the backend APIs and persistent storage.

## Repository layout

```text
backend/                   FastAPI modular monolith, Celery workers, Alembic migrations
  app/modules/<domain>/    One folder per domain module (design §5)
  app/integrations/        Provider adapters behind app/integrations/interfaces.py
frontend/                  React + TypeScript + Vite
  src/app/                 Router, theme preferences, and authenticated application layout
  src/components/ui/       Shared interface components
  src/features/            Landing, courses, lessons, assessments, and dashboards
  src/lib/api.ts           Typed live course and document API helpers
  src/lib/mock/            Historical demo fixtures (not used by application routes)
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

Frontend development (requires the API on port 8000 for application workflows):

```bash
cd frontend && npm ci && npm run dev         # http://localhost:5173
```

For frontend checks:

```bash
cd frontend && npm test && npm run build
```

For the full local stack, start the backend dependencies and services with Docker as shown above.

## Connected frontend and API boundary

The full Beyond Books interface is available at `/`. Previously shared `/demo` links use the
same authenticated app and backend; there is no password-free role switch or simulated grading.
The Vite development server proxies `/api` to `http://localhost:8000`. Override its target with
`VITE_API_PROXY` if the API runs elsewhere. Keep frontend and API on the same origin in production
so session cookies and CSRF headers work correctly.

- Sign in at `/login` or create an account at `/register`. Accounts open their assigned workspace.
- Teachers: open **Upload source** to create a course and upload a PDF, text, or Markdown file.
  Extraction progress comes from the actual job. An upload failure leaves the saved course
  accessible for retry; it does not report a successful draft.
- In a course, review **Sources & outline**, generate an outline, and apply the chapters you want.
  Open a chapter to edit objectives, generate/edit lessons and assessments, and publish reviewed work.
- Inside a lesson, add library or procedural 3D scenes, use the AI scene planner, edit animations,
  and publish scenes. **3D library** supports GLB upload, AI model generation, preview, and approval.
- Publish lessons, chapters, and the course, then enrol registered students from **Students**.
  Students see their enrolled published courses, explore lessons and scenes, save progress,
  submit server-graded assessments, and read feedback. Written answers use teacher review.
- **Insights** and **My progress** display server records. Empty accounts show empty states,
  rather than seeded learners, invented streaks, or sample scores.
- **Course details**, **Schools**, and the account page persist changes through the API.

The HTTP client in `frontend/src/api/client.ts` sends session cookies and CSRF headers, refreshes
expired sessions once, and exposes backend errors. Types are generated from OpenAPI; UI feature
hooks and `frontend/src/lib/api.ts` use those contracts. Source uploads send actual file bytes to
the backend-provided upload URL before requesting extraction. Cross-origin signed storage uploads
receive only the signed headers, without application cookies or CSRF credentials.

## Heart 3D and augmented reality

The Grade 8 Circulatory System lesson lets students open the interactive heart model directly in
the browser with **View 3D on the web** or launch image-tracked AR with **Start AR**. The browser
3D view supports touch and mouse rotation, zoom, labels, and anatomy details; AR places the same
model on the printed tracking page. The page can be opened on a second device or printed; the
marker image and tracking data live in `frontend/public/targets/`. The 3D heart model is in
`frontend/public/models/heart.glb`.

Camera access requires a secure browser context (HTTPS in deployment; `localhost` is allowed for
local development) and camera permission. If the camera or WebGL is unavailable, the AR view
shows an actionable error and the lesson's regular interactive 3D model remains available.

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
`EDU3D_THREE_D_PROVIDER` (`llm` = AI-designed three.js models | `fake` | `tripo` | `meshy`) plus that provider's key/model in
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
