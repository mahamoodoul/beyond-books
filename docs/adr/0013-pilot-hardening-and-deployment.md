# ADR 0013: Pilot hardening and deployment packaging

- **Status:** Proposed — Phase 10; region/provider choices remain open (#10, #12)
- **Date:** 2026-11-07

## Decision

- Ship two images (backend for API + worker, frontend nginx) built and smoke-tested on release
  tags; `docker-compose.prod.yml` for staging / single-host pilot. Cloud topology documented in
  `docs/INFRASTRUCTURE_AND_DEPLOYMENT.md` but not provisioned until region/budget are decided.
- Fail-closed production config (strong JWT secret, Secure cookies, real providers, Celery jobs);
  API docs disabled in staging/production; optional Secrets Manager loading.
- Security headers on API and SPA (CSP, frame denial, nosniff, HSTS behind TLS); per-IP API rate
  limit (in-process — replace with Redis before >1 replica); JSON access logs without query
  strings or bodies; readiness endpoint checking DB and Redis.
- GDPR export and deletion endpoints; teachers must transfer/delete owned content first.
- Automated IDOR sweep over every path-parameter route is part of the test suite, so new routes are
  covered automatically.
- Operations: stuck-job re-queue tool, backup/restore scripts, runbooks, security review document.
