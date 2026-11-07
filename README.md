# Beyond Books

Turn textbooks into interactive, chapter-based courses with lessons, quizzes and 3D models.
Teachers upload a textbook PDF and AI drafts chapters, lessons, quizzes and 3D scenes. Teachers
review and publish the drafts. Students then learn through lessons, the 3D Studio and quizzes.

- **System design (source of truth):** [README_Edu3D_AI_System_Design.md](README_Edu3D_AI_System_Design.md)
- **Feature checklist:** [docs/FEATURE_CHECKLIST.md](docs/FEATURE_CHECKLIST.md)

**Contents**
1. [What you need](#1-what-you-need)
2. [Get the code](#2-get-the-code)
3. [Run the project](#3-run-the-project): Docker, local, or hybrid
4. [Load the shared course data (seed)](#4-load-the-shared-course-data-seed)
5. [Accounts: teacher and student](#5-accounts-teacher-and-student)
6. [Settings reference](#6-settings-reference)
7. [AI providers (Claude, OpenAI, 3D, Blender)](#7-ai-providers)
8. [Everyday commands](#8-everyday-commands)
9. [Troubleshooting](#9-troubleshooting)
10. [Repository layout and docs](#10-repository-layout-and-docs)

---

## 1. What you need

| Tool | Version | Needed for | Install (macOS) |
|---|---|---|---|
| Git + **Git LFS** | any | Course PDFs and 3D models are stored in Git LFS | `brew install git git-lfs && git lfs install` |
| Docker Desktop | recent | Option A and C (Postgres, Redis, full stack) | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Python | **3.12+** | Option B and C (backend on your machine) | `brew install python@3.12` |
| Node.js + npm | **22** | Option B and C (frontend on your machine) | `brew install node@22` |
| Blender + uv | Blender 3.0+, uv | Optional: "Claude + Blender" 3D generation | see [docs/BLENDER_MCP.md](docs/BLENDER_MCP.md) |

You don't need an AI key to start: the default `fake` AI provider works offline. Add a Claude
key later for real AI content (section 7).

## 2. Get the code

```bash
git clone https://github.com/mahamoodoul/beyond-books.git
cd beyond-books
git lfs install          # once per computer
git lfs pull             # downloads the course PDFs and 3D models (real files, not placeholders)
```

If you cloned before installing Git LFS, run the last two commands now.

## 3. Run the project

Pick one option. **A** is the easiest. **C** is the recommended day-to-day setup: the real
database with fast local reloads. **B** needs nothing but Python and Node.

| | Database | Background jobs | Where the code runs |
|---|---|---|---|
| **A. Docker (full stack)** | PostgreSQL (container) | Redis + Celery worker (containers) | everything in Docker |
| **B. Local (no Docker)** | SQLite file `backend/dev.db` | inside the API process | your machine |
| **C. Hybrid** | PostgreSQL (container) | Redis (container) + local worker | your machine |

### Option A: Docker (full stack)

```bash
cp .env.example .env            # settings for Docker live in the ROOT .env
make up                         # = docker compose up --build
```

This starts:

| Service | URL / port | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | the app |
| API | http://localhost:8000 | API docs: http://localhost:8000/docs |
| PostgreSQL 16 + pgvector | localhost:5432 | user/password/db `edu3d` (from `.env`) |
| Redis 7 | localhost:6379 | job queue |
| Celery worker | | runs extraction, AI and 3D jobs |

On start the API applies database migrations and adds the demo heart model to the 3D library.
Uploaded files live in the Docker volume `storage`, and the database in the volume `pgdata`.

Stop with `Ctrl+C` or `make down`. To wipe the data, run `docker compose down -v`, which deletes
both volumes.

### Option B: Local without Docker (SQLite)

**1. Install dependencies (once)**

```bash
make backend-install            # creates backend/.venv and installs the backend (Python 3.12+)
make frontend-install           # npm install in frontend/
```

**2. Backend settings.** The backend reads **`backend/.env`**:

```bash
cp .env.example backend/.env
```

Then change these lines in `backend/.env`:

```dotenv
EDU3D_DATABASE_URL=sqlite:///./dev.db     # a file in backend/, no database server needed
EDU3D_JOBS_RUN_INLINE=true                # run jobs inside the API, no Redis/worker needed
EDU3D_LOCAL_STORAGE_DIR=./.storage        # uploaded files go to backend/.storage
```

**3. Create the database and the demo 3D model**

```bash
make migrate                    # alembic upgrade head -> creates backend/dev.db
make seed                       # demo heart model in the 3D library (safe to re-run)
```

**4. Start the backend and the frontend (two terminals)**

```bash
# terminal 1: API on http://localhost:8000 (auto-reload on code changes)
cd backend && .venv/bin/uvicorn app.main:app --port 8000 --reload

# terminal 2: app on http://localhost:5173 (proxies /api to port 8000)
make frontend-dev
```

### Option C: Hybrid (Postgres and Redis in Docker, code on your machine)

This is the recommended day-to-day setup. It uses the real database (PostgreSQL) with fast
local reloads.

**1. Start the databases in Docker**

```bash
make db                                   # = docker compose up -d postgres redis
```

Postgres listens on `localhost:5432`, with user, password and database from the root `.env`
(default `edu3d` / `edu3d` / `edu3d`). Redis listens on `localhost:6379`. The data is kept in the
Docker volume `ed3d_pgdata`.

**2. Backend settings.** Create `backend/.env` (`cp .env.example backend/.env`) and check these
lines:

```dotenv
EDU3D_DATABASE_URL=postgresql+psycopg://edu3d:edu3d@localhost:5432/edu3d   # same user/password as the root .env
EDU3D_REDIS_URL=redis://localhost:6379/0
EDU3D_JOBS_RUN_INLINE=true                # simplest: jobs run inside the API (no worker)
```

If the password contains special characters, URL-encode it in `EDU3D_DATABASE_URL`.

**3. Install, create the schema, run**

```bash
make backend-install frontend-install     # once
make migrate && make seed                 # schema + demo heart model
cd backend && .venv/bin/uvicorn app.main:app --port 8000 --reload        # terminal 1
make frontend-dev                                                        # terminal 2
```

With `EDU3D_JOBS_RUN_INLINE=false`, also start a worker:
`cd backend && .venv/bin/celery -A app.workers.celery_app worker -l INFO`.

**Port 5432 already used?** For example by Postgres.app or a Homebrew Postgres. Publish the
Docker Postgres on another port with a local `docker-compose.override.yml` (keep it out of git:
`echo docker-compose.override.yml >> .git/info/exclude`):

```yaml
services:
  postgres:
    ports: !override ["5433:5432"]
```

Then use `localhost:5433` in `EDU3D_DATABASE_URL` and run `make db` again.

**After restarting your computer:** start Docker Desktop, then `make db`. Never run
`docker compose down -v` unless you want to delete the database: `-v` removes the volumes.

### Move your existing SQLite data to Postgres

If you used Option B before, your data is in `backend/dev.db`. To copy it into Postgres:

```bash
make db                                   # Postgres running
# set EDU3D_DATABASE_URL in backend/.env to Postgres (step 2 above)
make migrate                              # creates the empty schema
make sqlite-to-postgres                   # copies every table from backend/dev.db
```

This copies all rows (accounts, courses, lessons, quizzes, 3D models, progress), and the
uploaded files stay in `backend/.storage`. `dev.db` is left unchanged as a backup. The target
must be empty: the script refuses to run otherwise. SQLite never enforced links between
tables, so rows that point at deleted data (for example an old test account) are reported and
left out. Restart the backend afterwards.

### Check that it runs

- http://localhost:8000/api/v1/health returns `{"status":"ok", ...}`
- http://localhost:5173 shows the landing page, and you can **Register** an account

## 4. Load the shared course data (seed)

The repository includes four complete sample courses: **Biology, Chemistry, Mathematics and
Physics**. They contain chapters, the extracted textbook text, lessons, quizzes, 3D scenes, the
3D models and the saved AI prompts. Loading them makes **no AI calls** and costs nothing.

With the app set up (Option A running, or Option B/C installed), run:

```bash
make seed-courses EMAIL=you@example.com PASSWORD=choose-a-password
```

This one command:

1. downloads the PDFs and 3D models (`git lfs pull`);
2. brings the database up to date (migrations);
3. creates the **teacher account** `EMAIL` with `PASSWORD` (12+ characters) if it doesn't exist.
   If you already have an account, leave out `PASSWORD`;
4. imports the four courses with their PDFs and 3D files into the app's storage.

It detects how you run the app:
- **Docker running:** it imports inside the API container, using its database and storage.
- **Otherwise:** it uses `backend/.venv` with `backend/.env`.

The first line of output shows the database and file storage it writes to.

Then sign in as that teacher and open **My courses**.

- **Safe to repeat:** existing data is skipped. Re-running also restores PDFs or 3D models that
  are missing from an earlier import, for example when Git LFS wasn't installed then.
- **Update the shared seed** after you've added content (maintainers):
  `make export-courses EMAIL=teacher@gmail.com`, then commit `seeds/courses/`.
  Details: [seeds/courses/README.md](seeds/courses/README.md).
- **Sources:** the PDFs in `sample-courses/` are OpenStax chapter excerpts (CC BY / CC BY-NC-SA),
  see [sample-courses/README.md](sample-courses/README.md).

The imported courses start as **drafts** (Biology is published). Students only see published
courses, chapters, lessons and 3D scenes.

## 5. Accounts: teacher and student

There are no built-in demo logins. Create accounts in the app:

| Who | How |
|---|---|
| Teacher | `make seed-courses EMAIL=... PASSWORD=...` (above), or **Register** → *Teacher* |
| Student | **Register** → *Student* (e.g. `student@example.com`) |

To give a student a course:

1. As the teacher, open the course and **publish** it, with its chapters, lessons and 3D scenes.
2. Open the **Students** tab, enter the student's email and click **Enroll**.

The student then sees the course under **My courses** and its 3D models in **3D Studio**.

Where to find things:
- **Teacher:** My courses (**New course**, then upload the textbook PDF under *Sources & outline*), 3D library (generate and review 3D models), Studio,
  Insights, Schools. Each chapter has **Open Studio** for step-by-step content generation.
- **Student:** My learning, My courses, 3D Studio (read-only, only their courses' published 3D
  models), My progress.

## 6. Settings reference

All settings are environment variables with the prefix `EDU3D_`. Where they are read from:

| How you run | Settings file |
|---|---|
| Docker (Option A) | root **`.env`**, passed to the containers by `docker-compose.yml` |
| Local / hybrid (B, C) | **`backend/.env`**. Use `EDU3D_ENV_FILE=path` to point at another file |

Variables already exported in your shell **override** the file. If a setting seems ignored,
check `env | grep EDU3D_`. Restart the backend after changing settings. Never commit real keys:
both `.env` files are git-ignored.

### Core

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_ENVIRONMENT` | `local` | `local`, `development`, `staging`, `production` or `test`. Staging and production enforce safe settings |
| `EDU3D_DATABASE_URL` | `postgresql+psycopg://edu3d:edu3d@localhost:5432/edu3d` | Database. Local: `sqlite:///./dev.db` |
| `EDU3D_REDIS_URL` | `redis://localhost:6379/0` | Job queue (unused when jobs run inline) |
| `EDU3D_JOBS_RUN_INLINE` | `false` | `true` runs jobs inside the API (no Redis/worker). Not allowed in production |
| `EDU3D_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed browser origins |
| `EDU3D_PUBLIC_BASE_URL` | `http://localhost:5173` | Public URL of the app |
| `EDU3D_LOG_FORMAT` | `text` | `text` or `json` |
| `EDU3D_RATE_LIMIT_PER_MINUTE` | `600` | Requests per minute per client IP |

### Accounts and security

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_JWT_SECRET` | dev-only value | Session signing secret. **Required** (32+ chars) outside local |
| `EDU3D_COOKIE_SECURE` | `false` | `true` on HTTPS (required in staging/production) |
| `EDU3D_OPEN_REGISTRATION` | `true` | Anyone can register |

### Storage and uploads

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_STORAGE_BACKEND` | `local` | `local` (folder) or `s3` |
| `EDU3D_LOCAL_STORAGE_DIR` | `./.storage` | Folder for uploads, PDFs and 3D files (Docker: `/data/storage`) |
| `EDU3D_S3_BUCKET` / `EDU3D_S3_REGION` | – / `eu-north-1` | When `s3` |
| `EDU3D_UPLOAD_MAX_BYTES` | 50 MB | Max source upload |
| `EDU3D_ASSET_MAX_BYTES` | 30 MB | Max 3D model (GLB) |

### AI text (lessons, outlines, quizzes, study cards)

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_LLM_PROVIDER` | `fake` | `fake` (offline), `anthropic` (Claude) or `openai` |
| `EDU3D_ANTHROPIC_API_KEY` | – | Claude API key |
| `EDU3D_ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model |
| `EDU3D_ANTHROPIC_EFFORT` | `medium` | `low` … `max`. Higher means better content, slower and costlier |
| `EDU3D_OPENAI_API_KEY` / `_MODEL` / `_BASE_URL` | – | OpenAI or any OpenAI-compatible endpoint |
| `EDU3D_LLM_MAX_OUTPUT_TOKENS` | `16000` | Max output per AI call (large 3D designs need a lot) |
| `EDU3D_LLM_INPUT_PRICE_PER_MTOK` / `_OUTPUT_` | `0` | Optional prices (USD per 1M tokens) for cost estimates |
| `EDU3D_AI_MAX_JOBS_PER_COURSE_PER_DAY` | `40` | Daily AI cap per course |

### 3D generation

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_THREE_D_PROVIDER` | `fake` | Default generator: `llm` (AI designs the model from shapes), `fake`, `tripo` or `meshy` |
| `EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY` | `5` | Daily 3D generations per teacher. Raise it locally (e.g. `50`) |
| `EDU3D_TRIPO_API_KEY` / `EDU3D_MESHY_API_KEY` | – | Only for those providers (adapters pending verification) |
| `EDU3D_BLENDER_MCP_COMMAND` | `uvx mcp-for-blender` | "Claude + Blender" generator (local only) |
| `EDU3D_BLENDER_HOST` / `_PORT` | `localhost` / `9876` | Where the Blender add-on listens |
| `EDU3D_BLENDER_MODEL` | (= Anthropic model) | Claude model for Blender builds |
| `EDU3D_BLENDER_MAX_TURNS` / `_TIMEOUT_S` | `40` / `540` | Limits per Blender build |

### Voice narration (3D Studio guided tour)

| Variable | Default | Meaning |
|---|---|---|
| `EDU3D_ELEVENLABS_API_KEY` | – | ElevenLabs key. Empty = no Voice button in the Studio |
| `EDU3D_ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` (Rachel) | Any voice from your ElevenLabs library |
| `EDU3D_ELEVENLABS_MODEL` | `eleven_turbo_v2_5` | `eleven_multilingual_v2` for the highest quality |
| `EDU3D_SPEECH_PER_USER_PER_HOUR` | `120` | New syntheses per user per hour. Each text is synthesised once and cached in storage |

The full list with comments is in [.env.example](.env.example). The code is in
[backend/app/core/config.py](backend/app/core/config.py).

## 7. AI providers

**Real AI content with Claude.** In `backend/.env` (or the root `.env` for Docker), set:

```dotenv
EDU3D_LLM_PROVIDER=anthropic
EDU3D_ANTHROPIC_API_KEY=sk-ant-...
EDU3D_THREE_D_PROVIDER=llm      # AI-designed 3D models, no extra key needed
```

Then restart the backend. A `401` error in the app means the key is wrong or expired.

**Claude + Blender (detailed 3D models, local only).** Claude builds the model in your running
Blender through Blender MCP, and the result is saved to the 3D library. This needs Blender open
with the *MCP for Blender* add-on, `uv` installed, and the Claude key set. It only works with
Option B or C, because the API must reach Blender on your machine. Then choose **Claude + Blender**
as the generator in the 3D library. Setup: [docs/BLENDER_MCP.md](docs/BLENDER_MCP.md).

**Tuning the 3D generator.** The quality prompt every 3D build starts with (realism, materials,
selectable parts, animations, validation) lives in
`backend/app/modules/ai_engine/tuning/three_d_model.md`. Edit it, or point
`EDU3D_THREE_D_TUNING_PROMPT_FILE` at your own file; the next generation picks it up without a
restart. `EDU3D_THREE_D_EFFORT` sets the reasoning effort for 3D builds only. Details:
[docs/BLENDER_MCP.md](docs/BLENDER_MCP.md#model-tuning-the-quality-prompt).

**Adding another vendor:** [docs/ADDING_A_PROVIDER.md](docs/ADDING_A_PROVIDER.md).

## 8. Everyday commands

| Command | What it does |
|---|---|
| `make up` / `make down` | Start / stop the Docker stack |
| `make db` | Only Postgres + Redis in Docker (Option C) |
| `make sqlite-to-postgres` | Copy `backend/dev.db` into the Postgres of `backend/.env` |
| `make backend-install` / `make frontend-install` | Install dependencies |
| `make migrate` | Apply database migrations |
| `make seed` | Demo heart model in the 3D library |
| `make seed-courses EMAIL=… PASSWORD=…` | Load the shared courses (section 4) |
| `make export-courses EMAIL=…` | Save a teacher's courses as the shared seed |
| `make frontend-dev` | Frontend dev server on :5173 |
| `make backend-test` / `make backend-lint` | Backend tests / lint and types |
| `cd frontend && npm test && npm run build` | Frontend tests / production build |
| `make contracts` | Regenerate API and 3D types after backend schema changes (CI checks these) |
| `make check` | Everything CI runs |
| `make smoke URL=http://localhost:8000` | Live API smoke test |

After `git pull`, run `make migrate`. If `package.json` or `pyproject.toml` changed, re-run the
install commands.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Courses have no PDF or 3D model; files start with `version https://git-lfs` | Git LFS missing: `brew install git-lfs && git lfs install && git lfs pull`, then run `make seed-courses EMAIL=…` again |
| `make seed-courses`: "No account …" | Add `PASSWORD=…` (12+ characters) to create the account |
| `make seed-courses`: "Start the app first" | Start Docker (`make up`) or install the backend (`make backend-install`) |
| Seeded data doesn't show in the app | The import wrote to a different database. Compare its first output line with your app's settings, and check exported `EDU3D_*` shell variables |
| `.venv/bin/python: No such file` | `make backend-install` (needs Python 3.12+) |
| API can't connect to the database | Docker/Postgres not running (`docker compose up -d postgres`), or `EDU3D_DATABASE_URL` is wrong |
| Jobs stay "queued" | No worker: start the Celery worker, or set `EDU3D_JOBS_RUN_INLINE=true` |
| AI fails with `401` | Wrong or expired `EDU3D_ANTHROPIC_API_KEY`. Fix it and restart the backend |
| "Daily 3D generation limit" | Raise `EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY` and restart |
| Claude + Blender: "Blender is not reachable" | Open Blender with its window, enable the *MCP for Blender* add-on (port 9876) |
| Port 5173 / 8000 already in use | Stop the other process, or the other copy of the stack |
| Port 5432 already in use (`bind: address already in use`) | Another Postgres is running (e.g. Postgres.app). Use port 5433 via `docker-compose.override.yml` (Option C) |
| Postgres: `No space left on device` | Docker's disk is full. Free space with `docker builder prune` (build cache) or remove unused images. Postgres recovers its data on the next start |
| Student sees no course or 3D model | Publish the course, chapter, lesson and scene, and enrol the student (section 5) |

## 10. Repository layout and docs

```text
backend/                 FastAPI modular monolith, Celery workers, Alembic migrations
  app/modules/<domain>/  one folder per domain (courses, chapters, lessons, three_d, ai_engine, …)
  app/integrations/      providers: LLM (Claude/OpenAI/fake), 3D (llm/Blender/fake), storage
frontend/                React 19 + TypeScript + Vite + Tailwind + React Three Fiber
  src/features/          pages and components per feature (courses, three-d, student, …)
  src/api/generated/     API types generated from OpenAPI (make contracts)
packages/                3D scene/animation contracts and demo 3D assets
seeds/courses/           shared course seed (bundle.json + 3D files, Git LFS)
sample-courses/          course PDFs (OpenStax excerpts, Git LFS)
scripts/                 seed import/export, contract export, API smoke test
infrastructure/docker/   Dockerfiles; docker-compose.yml at the root
docs/                    guides, ADRs, runbooks
```

| Topic | Document |
|---|---|
| System design | [README_Edu3D_AI_System_Design.md](README_Edu3D_AI_System_Design.md) |
| Features and status | [docs/FEATURE_CHECKLIST.md](docs/FEATURE_CHECKLIST.md) |
| 3D asset workflow / Blender | [docs/3d-asset-workflow.md](docs/3d-asset-workflow.md), [docs/BLENDER_MCP.md](docs/BLENDER_MCP.md) |
| Quiz builder | [docs/quiz-builder.md](docs/quiz-builder.md) |
| Testing | [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) |
| Deployment | [docs/INFRASTRUCTURE_AND_DEPLOYMENT.md](docs/INFRASTRUCTURE_AND_DEPLOYMENT.md) |
| Security | [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) |
| Runbooks | [docs/RUNBOOKS.md](docs/RUNBOOKS.md) |
| Decisions | [docs/adr/](docs/adr/README.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

**AR heart:** the Grade 8 circulatory-system lesson has **View 3D on the web** and **Start AR**.
AR needs HTTPS (or `localhost`) and camera permission. The marker is in
`frontend/public/targets/`.
