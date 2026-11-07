# Testing strategy

| Layer | Where | What it guarantees |
|---|---|---|
| Unit + API integration | `backend/tests/` (pytest, fake AI/3D providers, SQLite; CI also runs migrations on PostgreSQL) | Domain rules, authorization, AI validation, contracts |
| **API coverage gate** | `backend/tests/conftest.py` | When the full suite runs, **every documented route must return 2xx in at least one test**, or the run fails with the list of uncovered routes. New endpoints cannot ship untested. |
| **End-to-end journey** | `backend/tests/test_e2e_full_journey.py` | One test walks every feature in order: school/classroom → course → PDF → AI outline (apply/discard) → AI lesson (+ regenerate, publish/unpublish) → 3D assets (upload/review/download, AI-designed model) → scenes + animations (+ AI) → AI quiz → student enrolment, lesson, 3D, events, attempt, Explain Further → teacher review → analytics/insights → GDPR export |
| Cross-tenant sweep | `backend/tests/test_idor_sweep.py` | Every path-parameter route called by an unrelated teacher and student: zero successes |
| Frontend | `frontend/src/**/*.test.ts` (vitest) + type check + build | Viewer runtime, animation contract, demo data source |
| **Live smoke** | `scripts/api_smoke.py` (`make smoke URL=...`) | Runs the main journey over real HTTP against a running deployment (local, Coolify, staging). `AI=1` adds real AI calls (costs tokens). Leaves a throw-away teacher + course; deletes the student. |

Run everything locally: `make check` (backend lint/types/tests + gate, contracts, frontend checks).
Smoke a deployment: `make smoke URL=https://<host>` (needs `EDU3D_OPEN_REGISTRATION=true`, or pass
`--teacher email:pw --student email:pw` to the script).
