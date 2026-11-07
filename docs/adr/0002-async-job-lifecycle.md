# ADR 0002: Shared asynchronous job lifecycle

- **Status:** Proposed
- **Date:** 2026-11-07

## Context

PDF extraction, AI generation and 3D provider calls take seconds to minutes and may fail
transiently (design §10).

## Decision

All long-running work is a job with status
`queued → processing → validating → completed`, plus `retrying`, `failed`, `cancelled`, as defined in
`backend/app/modules/operations/jobs.py`. Output must pass validation before `completed`. The API
returns a job ID; the frontend polls `GET /api/v1/jobs/{id}` (SSE later if useful).

## Consequences

- One status UI and one runbook for every job type.
- Workers must be idempotent and check provider task state before retrying to avoid double billing.
