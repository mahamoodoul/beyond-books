# Device check

Tests Beyond Books the way schools would use it: on old and cheap devices, on slow school Wi-Fi.
It produces a report in `docs/reports/device-check-<date>.md`.

## What it checks

- **Device profiles:**
  - a reference laptop
  - a budget Chromebook: 6× slower CPU, school Wi-Fi, software 3D standing in for a weak GPU
  - an iPad 6th gen on Safari's engine (WebKit)
  - an iPad-sized screen with a 4× slower CPU
  - a low-end Android phone on slow 4G
- **Pages:** 18 pages, including the landing page, sign-in, the student pages, the 6 labs, the 3D Studio and the teacher pages.
- **Measured on each page:**
  - load time and first paint
  - data downloaded
  - main-thread freezes
  - pages wider than the screen
  - touch targets under 24×24 px
  - browser errors
  - accessibility (axe-core, WCAG 2.1 AA, on the laptop profile)
- **Labs and 3D:**
  - each lab: one control is used, then frame rate and response time are measured, and Full screen is opened and closed
  - the 3D Studio: frame rate
- **Font experiment:** first paint with Google Fonts as today, when Google is unreachable, and without Google.
- **Security** (no data changes):
  - access control
  - tampered and unsigned tokens
  - CSRF and CORS
  - sign-in rate limit and account guessing
  - cookie settings
  - API and nginx security headers
  - third-party requests
  - raw-HTML code
  - known vulnerabilities in frontend and backend packages
  - the backend's cross-pupil access test sweep

The run is read-only: every API write is blocked, so no progress, answers or settings are saved.

## Run it

```sh
# 1. backend running on :8000 (make dev or uvicorn), local environment, seeded data
# 2. production build served on :4173
cd frontend && npm run build && npx vite preview --port 4173
# 3. once: install the tool
cd tools/device-check && npm install && npx playwright install chromium webkit
# 4. run everything (about 20 minutes) and write the report
./check.sh
```

Run a single profile with `DEVICE_LIST="ipad-safari" ./check.sh`.

`mint_sessions.py` signs in the seeded `teacher@gmail.com` and `student@gmail.com` with ordinary
sessions (it refuses to run outside local/dev/test). To use other accounts, set
`DEVICE_CHECK_TEACHER` and `DEVICE_CHECK_STUDENT`.

## Limits

These are emulations on a Mac, not the real devices. A short check on one real old iPad and
one real Chromebook is still worth doing before a school pilot.
