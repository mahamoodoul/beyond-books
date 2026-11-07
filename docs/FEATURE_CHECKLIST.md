# Beyond Books — Feature Checklist

Status of every product feature, plus the hackathon jury-readiness items.

- `[x]` = built and exercised by automated tests on `main` (last full run: 186 backend + 33 frontend tests, all 110 API routes return 2xx in at least one test, smoke test 25/25 steps).
- `[ ]` = not done yet, or needs a person to do it (user tests, rehearsal, decisions).

Each section names its owner area so the team can split the work. Where a note says "verify", the code exists but nobody has checked it by hand in the browser yet.

---

## 0. Project brief (agree before the demo)

| Decision | Answer |
|---|---|
| Project name | Beyond Books |
| One-sentence promise | We help **teachers** turn **textbook chapters** into **interactive 3D lessons and assessments** in minutes, using AI that reads the book and builds the lesson, quiz and 3D scene. |
| Primary user | Secondary-school teacher (biology/science first), plus their students |
| Current problem | [ ] Fill in from teacher interviews: how long does it take today to build one lesson with visuals and a quiz? |
| Existing workaround | [ ] Fill in: slides, YouTube, static textbook images, generic quiz tools |
| Core flow | Upload textbook PDF → AI outline → AI lesson + quiz + 3D scene → teacher reviews/publishes → student learns, answers, gets feedback → teacher sees analytics |
| Differentiator | The LLM designs the 3D model itself (named, explainable parts) from the lesson text, and teacher and students can ask AI about any part |
| Success measure | [ ] Define and measure: e.g. minutes from PDF to published lesson, compared with the teacher's current method |
| Demo input | Demo course seeded by `make seed` (synthetic content) + one permitted textbook chapter PDF |
| Explicit exclusions | Payments, self-signup for students, mobile apps, custom model training, real student data |
| Repository | https://github.com/mahamoodoul/beyond-books |
| Demo URL | [ ] Add the Coolify URL once deployed |

---

## 1. Accounts, roles and security (Backend: authentication, users, organizations)

- [x] Register, log in, log out (`/auth/register`, `/auth/login`, `/auth/logout`)
- [x] Cookie session: short-lived JWT access token + rotating refresh token (`/auth/refresh`)
- [x] Roles: teacher, student, school admin; every endpoint checks the role
- [x] Record ownership checks on every resource (IDOR sweep test covers all routes)
- [x] CSRF protection (`X-Requested-With: edu3d` header required)
- [x] Login rate limit + global per-IP rate limit
- [x] Security headers (CSP, frame, referrer, etc.)
- [x] Profile view/edit (`/me`), account page in the UI
- [x] GDPR: export my data (`/me/export`) and delete my account (`DELETE /me`)
- [x] Production safety: refuses to start with the dev JWT secret, insecure cookies, fake AI providers or inline jobs
- [x] Optional AWS Secrets Manager loading
- [ ] Email verification, password reset, invite-only student accounts, staff MFA
- [ ] Malware scanning of uploads (signature checks only today)
- [ ] Redis-backed rate limiting (needed before more than one API replica)
- [ ] PostgreSQL row-level security
- [ ] DPIA / privacy review with a qualified adviser — **no real students before this**
- [ ] Penetration test of the deployed environment

## 2. Schools, classrooms and courses (Backend: organizations, classrooms, courses)

- [x] Schools and school members; school list page (`/teacher/schools`)
- [x] Classrooms: create, view, members
- [x] Courses: create, list, view, edit
- [x] Enrol and remove students; course student list
- [x] Teacher course list (`/teacher/courses`) and course page
- [x] Student course list (`/student/courses`) and course page

## 3. Textbook upload and processing (Backend: documents)

- [x] Upload a PDF via a signed upload URL (`/teacher/upload`)
- [x] Size and file-type validation
- [x] Text extraction per page (`/documents/{id}/pages`)
- [x] Document status shown while processing (background job with polling)
- [x] Course document list
- [ ] Verify: upload of a real scanned textbook (no text layer) shows a clear error — OCR is not built

## 4. AI course building (Backend: ai_engine)

- [x] Pluggable LLM providers chosen in `.env`: Anthropic Claude (default), OpenAI or compatible, fake (offline dev/tests)
- [x] AI outline proposal from the textbook (`/courses/{id}/ai/outline`); teacher applies or discards it
- [x] Structured-output validation: AI output is checked against the contract before saving
- [x] AI lesson generation for a chapter (`/chapters/{id}/ai/lesson`)
- [x] Regenerate a single lesson section
- [x] AI assessment (quiz) generation for a chapter
- [x] AI explanation of a student's answer ("explain further")
- [x] Per-course daily AI job limit and a usage/cost page (`/courses/{id}/ai/usage`)
- [x] Timeouts, no hidden retries, clear failure state when the provider is down
- [x] Generated content is a draft until the teacher publishes it
- [ ] Small evaluation set: 5–10 chapters with expected properties, run before the demo
- [ ] Show source page references next to AI-generated lesson text (grounding)

## 5. Chapters and lessons (Backend: chapters, lessons)

- [x] Chapters: list, view, edit, delete, learning objectives
- [x] Lessons: view, edit, delete, publish/unpublish
- [x] Lesson version history
- [x] Teacher lesson editor; student lesson view with progress tracking

## 6. 3D content (Backend: three_d, animations; Frontend: features/three-d)

- [x] Pluggable 3D providers in `.env`: **LLM-designed models** (Claude builds the model from named primitives, saved as GLB), fake (offline); Tripo and Meshy adapters stubbed for later
- [x] Provider list endpoint; per-request choice of provider (`/three-d/providers`)
- [x] Asset library: upload GLB, versions, teacher review/approve, search, signed download
- [x] Asset generation jobs with a daily per-user limit
- [x] AI scene plan for a lesson (`/lessons/{id}/ai/scene`) with the AI's rationale shown
- [x] Scenes: create, view, edit, delete, publish/unpublish, duplicate
- [x] Scene parts: add, rename, explain, remove; camera and controls settings
- [x] Animations: AI-generated, edit, delete
- [x] AI part insight: explain deeper, simplify, compare, quiz question (`/scenes/{id}/ai/part-insight`)
- [x] **Lesson 3D Studio** (`/teacher/lessons/:id/studio`): 3-panel layout, hotspots, x-ray, zoom, guided tour
- [x] **Chapter Studio** (`/teacher/chapters/:id/studio`), opened from **Open Studio** on each chapter in the course:
  - [x] Chapter text panel: the textbook passages the AI reads (`GET /chapters/{id}/source`)
  - [x] Chapter prompt: the teacher's instructions saved on the chapter and used by lesson, quiz and 3D generation
  - [x] One-click "Generate selected content": lesson + quiz in parallel, then 3D scenes, with live step status
  - [x] Board of lessons and quizzes (status, AI badge, edit links) + 3D scene board with full scene editor
  - [x] **Publish chapter** (`POST /chapters/{id}/publish`): publishes lessons, 3D scenes, quizzes and the chapter (optionally the course); unready items are skipped and listed
- [x] Chapter preview (`/teacher/chapters/:id/preview`): course › chapter as students see it, with lessons, 3D, quizzes (show/hide answers) and live/draft markers
- [x] Student course page: chapter cards under the course name, with a 3D marker on lessons that have published scenes
- [x] Public 3D viewer (`/viewer`, `/viewer/:sceneId`)
- [x] Student sees published scenes inside the lesson
- [x] 3D library: topic → AI-written in-depth build prompt (`POST /three-d/prompt-drafts`), editable before generating
- [x] "blender" 3D provider: Claude builds the model in local Blender via Blender MCP; server exports GLB into the library (dev only, see `docs/BLENDER_MCP.md`)
- [ ] Verify by hand: one real Blender MCP build end to end (needs the add-on installed and Blender open)
- [ ] AR heart demo (`features/ar/HeartARPage.tsx`, MindAR) — **code exists but no route links to it**; decide: route it or remove it
- [ ] Verify by hand: LLM-generated models look recognisable for 3+ demo topics (e.g. heart, cell, plant)
- [ ] Real Tripo/Meshy integration (only after verifying their APIs)

## 7. Assessments and feedback (Backend: assessments, evaluations)

- [x] Assessments: view, edit questions, publish/unpublish
- [x] Students start an attempt, answer, submit
- [x] Answer keys never sent to students before submission (tested)
- [x] Automatic grading + AI evaluation of open answers
- [x] Teacher review queue; teacher can override an AI evaluation
- [x] Student sees the reviewed attempt with explanations

## 8. Progress and analytics (Backend: progress, analytics)

- [x] Learning events recorded (`/learning-events`)
- [x] Lesson progress per student; student progress page (`/student/progress`)
- [x] Course analytics for the teacher
- [x] Per-student insights for the teacher; "my insights" for the student
- [x] Teacher insights page (`/teacher/insights`)

## 9. Interface and design (Frontend)

- [x] Landing page, login, register
- [x] Teacher dashboard and student dashboard
- [x] Loading, empty and error states on data pages
- [x] Job progress shown for long AI tasks
- [x] Lazy-loaded routes so the 3D code doesn't slow the first page
- [ ] Keyboard-only walkthrough of the core flow (accessibility)
- [ ] Reduced-motion check for 3D auto-rotate and tour
- [ ] Test on the actual demo laptop and projector resolution

## 10. Engineering, operations and deployment

- [x] FastAPI backend, React 19 frontend, PostgreSQL (SQLite for local dev)
- [x] Database migrations (Alembic, 0001–0010), checked on PostgreSQL in CI
- [x] Background jobs (Celery + Redis), or inline mode for local dev
- [x] Health checks (`/health`, `/health/ready`)
- [x] Request IDs and JSON logs
- [x] Shared API contract: OpenAPI → TypeScript types, JSON Schemas for AI content
- [x] CI on every pull request: backend, frontend, migrations
- [x] API coverage gate: the test run fails if any route has no successful test
- [x] One-command checks: `make check`; live smoke test: `make smoke`
- [x] Demo seed: `make seed`; database backup and restore scripts
- [x] Docker Compose for local, production and Coolify
- [x] Docs: ADRs 0004–0014, testing strategy, security review, runbooks, deployment, how to add a provider
- [ ] Deploy to the shared Coolify URL and open it from the demo device
- [ ] Teammate runs the README setup from a clean checkout
- [ ] Demo reset documented: what `make seed` deletes and how to start fresh

---

## 11. Hackathon jury readiness

### Evidence per open-round criterion

- [ ] **Functionality:** live run with a fresh chapter PDF → outline → lesson → 3D scene → quiz → student answer → analytics
- [ ] **A real problem:** 3+ teacher conversations written down (who, subject, how long lesson prep takes today)
- [ ] **Innovation:** show the LLM designing a 3D model with named parts, and a part-insight answer
- [ ] **Design:** 3+ people complete the core task without coaching; note where they hesitated and what we changed
- [ ] **Team efficiency:** list of what we cut and why (see exclusions above), and who built what

### Core-flow definition of done

- [ ] A new user understands where to start
- [ ] Fresh input produces a result through real AI (not the fake provider)
- [ ] A different chapter produces a different lesson and scene
- [ ] Invalid upload (wrong type, too large) gives clear feedback
- [ ] AI provider down → clear failure message, nothing fake shown
- [ ] Reset and run again without touching code or the database by hand

### Demo day

- [ ] Confirm time limit and submission requirements
- [ ] Check provider quota and API key on the demo machine
- [ ] Prepare 2 demo chapters (main + variation)
- [ ] Record a clearly labelled backup video of a real run
- [ ] Hide secrets and notifications on screen
- [ ] Rehearse the 3-minute script, including recovery from an error
- [ ] Measure one claim (e.g. lesson-prep time, old way vs Beyond Books) and state the sample size

### Final-round answers (one owner each)

- [ ] Founders: next step if we win (pilot school, owner, timeframe)
- [ ] IT/security: biggest technical risk and mitigation (AI output quality; student data privacy)
- [ ] Product: what we left out and why
- [ ] Marketing: first 100 users (which teachers, which channel, what counts as activation)
- [ ] Design: how we tested with users
- [ ] Law: textbook copyright, student data (GDPR, minors), AI-generated content — questions to verify
- [ ] Domain experts: existing alternatives and what we do better
