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
- [x] Join codes: every school and course has a short code; sign-up form previews what a code unlocks and joins it; *Join with a code* on the account page; teachers copy/regenerate codes (Schools page, course Students tab, account page); 16-character codes validated server-side; demo seed sets DEMOSCHOOLNORWAY, BIOLOGY101DEMO26, CHEMISTRY101DEMO, MATHS101DEMO2026, PHYSICS101DEMO26
- [x] Server-side password rules (length, character mix or passphrase, no runs/repeats, common-password list, no name/email inside)
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

- [x] Upload a PDF via a signed upload URL (course → Sources & outline)
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

## 4b. Labs (Backend: labs; Frontend: features/labs)

Hands-on simulations a teacher publishes into a course; students build, the teacher watches
every student's state live. One generic Labs module with an engine per kind (goal, palette,
state validation, evaluation, sub-goals), mirrored in the browser for instant feedback.

- [x] Teacher **Labs** tab: pick a kind, course and chapter, goal and palette; edit, publish,
  unpublish, delete; "try it yourself" board; live student activity (state summary, problems
  flagged, sub-goals done, changes, last change); counters on each lab card
- [x] Student **Labs** tab and lab rows in the course path; step-by-step guide derived from the
  state, with hints and "Why?"; undo/redo; goal-reached moment; everything saved per change
- [x] **Electric circuit:** battery, bulbs, switches, wires; nodal-analysis solver (open loop,
  open switch, short circuit, series dim, parallel bright); realistic bench with animated current
- [x] **Molecular bonding** (Chemistry, from the interview priorities): atoms as shaded spheres,
  single/double/triple bonds, valence check with "bonds still wanted" badges, formula in Hill
  order, molecule names, VSEPR shape for simple molecules, targets such as H₂O, CO₂, CH₄
- [x] **Pressure and buoyancy** (Physics): materials and liquids with real densities, custom
  densities, volume, object settles floating or sinking with force arrows, draggable pressure
  probe on a depth scale, tasks (float, sink, half-submerged, fresh vs salt, 10 kPa)
- [ ] Verify in a browser with two accounts side by side (teacher watching, student building)
- [ ] Chemistry: balance a chemical equation; ionic bonding (the current engine covers covalent)
- [x] **Breathing and gas exchange** (Biology): chest with ribs, lungs and diaphragm that flatten
  and dome (by hand or "Auto" at the chosen rate), breathing rate and depth, rest/walk/run with
  oxygen uptake vs need and blood oxygen, alveolus zoom with O₂/CO₂ exchange and a traced
  molecule; tasks (inhale, exhale, rate, exercise, trace)
- [x] **Solar system and orbits** (Astronomy): inner planets with real periods (play, time
  slider, drag Earth), Sun–Earth–Moon view with phases and solar/lunar eclipses (drag the Moon),
  seasons view with axial tilt, day length and noon Sun height at a chosen latitude; scale
  approximations labelled; tasks (both eclipses, a full year, summer and winter, zero tilt)
- [x] **Plate tectonics and earthquakes** (Earth science): subduction, collision, divergent and
  transform boundaries over millions of years (trench, slab, volcanoes, mountains, magnetic
  stripes, fault offset), clickable Earth layers, P and S waves with shadow zones and a movable
  seismometer; time scale stated (1 Myr = 50 km); tasks (subduction, mountains, compare,
  layers, waves)

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
- [x] AWS single-instance deployment designed in Terraform (`infrastructure/aws/terraform`): VPC, EC2 with SSM, S3, Secrets Manager, alarms, budget, Caddy TLS, optional Blender container; validated, not yet applied
- [ ] Teammate runs the README setup from a clean checkout
- [ ] Demo reset documented: what `make seed` deletes and how to start fresh

---

## 11. Hackathon jury readiness

### Evidence per open-round criterion

- [x] **Functionality:** live run through real AI, verified 2026-11-08 on the local stack with
  `make smoke URL=http://localhost:8000 AI=1` (29/29 steps: text source → AI outline → AI lesson →
  3D scene → quiz → student answer → analytics, Claude Opus 5.5). The four sample courses were
  built the same way from real chapter PDFs (`sample-courses/`): 93 Claude calls recorded in
  `ai_usage_records`. Still to do on demo day: run it once more on the demo machine with a PDF
  the jury has not seen.
- [x] **A real problem:** three teacher conversations (Ingrid, naturfag, 17 years; Daniel,
  science and maths, 3 years; Fatima, biology, 9 years) with transcripts and what we learned in
  [docs/jury/teacher-conversations.md](jury/teacher-conversations.md): 2 to 3 hours per new
  topic today, review-before-publish as the condition for trust. *Add the date and channel of
  each conversation to the file.*
- [x] **Innovation:** the LLM designs the 3D model itself (`llm` provider: named parts with
  descriptions, `three_d_model_design` prompt) or builds it in Blender (`blender` provider); click
  a part in the Studio for the part-insight answer (`POST /scenes/{id}/ai/part-insight`, study
  cards). Demo path: 3D library → Generate with AI → open in Studio → click a part.
- [ ] **Design:** 3+ people complete the core task without coaching; note where they hesitated and
  what we changed. *Not started.* Script and observation sheet:
  [docs/jury/usability-sessions.md](jury/usability-sessions.md).
- [x] **Team efficiency:** [docs/jury/team-efficiency.md](jury/team-efficiency.md): the
  submission paragraph, who built what (from `git log`), what we cut and why, and how we worked
  (branches, PRs, CI, coverage gate, smoke test). Confirmed 2026-11-08.

### Core-flow definition of done

- [x] A new user understands where to start: an empty teacher dashboard shows "Start your first
  course"; **New course** explains the next step ("upload the textbook PDF… let AI propose the
  chapters"); a course with no chapters opens on **Sources & outline**; every chapter card has
  **Open Studio**. *Verify with the Design sessions above.*
- [x] Fresh input produces a result through real AI: the smoke run above used the `anthropic`
  provider end to end; fake providers are refused in staging/production (startup check).
- [x] A different chapter produces a different lesson and scene: lessons are generated per chapter
  from that chapter's pages, scenes per lesson. In the seeded data every chapter has its own
  lesson body and scene spec (Biology 2/2, Physics 2 lessons, 3 distinct scene specs).
- [x] Invalid upload gives clear feedback: declared size over the limit → "Files are limited to
  50 MB"; wrong MIME type refused; content that is not a PDF refused by sniffing; a scanned PDF
  without text fails with a message. Tests: `test_documents.py` (reject not-a-PDF, disallowed
  MIME and oversize, size mismatch, scanned PDF). The Sources panel shows the error text.
- [x] AI provider down → clear failure message, nothing fake shown: adapters raise
  transient/permanent errors with no hidden retries (`max_retries=0`, timeout); the job ends
  `failed` with an error code and message, nothing is saved
  (`test_provider_failures_fail_job_safely`); the UI shows the job's `error_message` (Sources
  panel, outline/lesson panels, 3D generation tray).
- [x] Reset and run again without touching code or the database by hand: `docker compose down -v
  && make up` for a clean stack; `make seed-courses EMAIL=…` reloads the sample courses;
  `make seed-students EMAIL=… RESET=1` regenerates demo students and activity;
  `scripts/backup_db.sh` / `restore_db.sh` for snapshots.

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
