# Team efficiency (evidence for the jury)

Final version for the submission, confirmed by the team on 2026-11-08. Source: repository
history (`git log`), the project brief in `docs/FEATURE_CHECKLIST.md`, and CI configuration.

## The paragraph

Four people built Beyond Books in 48 hours by splitting the product along its seams and merging
through pull requests with CI on every one. Shakil owned the backend and the AI pipeline:
textbook extraction, Claude outlines, lessons and quizzes, the LLM-designed and Blender-built 3D
models, the teacher Studio, analytics, and the one-command seeds that give every machine the
same courses and demo students. Rizve owned the student experience: landing page, student course
and lesson pages, the 3D heart and CT views, and sign-in. Prinon owned the quiz builder, voice
narration with ElevenLabs, and the 3D asset pipeline (Blender exports, Git LFS). Sohan owned
deployment: the Coolify stack, migrations on start, health checks and production images. We cut
on purpose: no payments, no student self-signup, no mobile apps, no custom model training, and
no real student data before a privacy review, so all four of us could spend the time on the one
flow that matters, from a chapter PDF to a lesson a student can click through. A feature counted
as done only when its API routes were covered by tests (the test run fails if any route is
untested) and the live smoke test passed end to end.

## Who built what (from `git log`, no merges)

| Person | Commits | Area |
|---|---|---|
| Shakil (Md Mahamodul Islam) | 37 | Backend, AI pipeline, 3D Studio, Claude + Blender, analytics, seeds, README and infra docs |
| Rizve Hasan | 24 | Student experience, landing, course catalog and enrolment, 3D heart and CT views, logo, sign-in |
| Ruhit Rafian Prinon | 9 | Quiz builder, ElevenLabs narration, 3D viewer library and asset pipeline, Git LFS, landing hero |
| Sohan (G. M. Ansarul Kabir) | 9 | Coolify production deployment, start scripts, health checks, compose tuning |

## What we cut, and why

| Cut | Why |
|---|---|
| Payments | Not needed to prove the teaching value; adds legal and security work |
| Student self-signup | Teachers enrol students; avoids spam accounts and consent questions |
| Mobile apps | The web app works on tablets; native apps are a separate product |
| Custom model training | Off-the-shelf Claude designs lessons and 3D models well enough to test the idea |
| Real student data | Needs a privacy review first; the demo uses seeded students and synthetic activity |
| OCR for scanned textbooks | Text-layer PDFs cover the sample courses; scanned PDFs fail with a clear message instead |
| Email verification, password reset, MFA | Not needed for a supervised pilot; listed in the security review as pre-pilot work |

## How we worked

- One branch per person, merged into the shared branch through pull requests; main is never
  pushed directly.
- CI on every pull request: backend tests, frontend tests, migrations on Postgres.
- An API coverage gate fails the test run if any route has no successful test.
- A live smoke test (`make smoke`) walks the whole flow against a running server, with or
  without real AI calls.
- Shared seeds (`make seed-courses`, `make seed-students`) so every machine shows the same demo.
