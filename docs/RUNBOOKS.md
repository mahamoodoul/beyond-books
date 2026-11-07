# Runbooks

Every entry: **detect → contain → fix → verify**. Correlate with `request_id` (in API error
envelopes, `X-Request-ID` headers and JSON logs). Job state: `python -m
app.modules.operations.maintenance stats`.

## LLM provider outage
- Detect: AI jobs `failed` with `RETRIES_EXHAUSTED`/`PROVIDER_ERROR`; provider status page.
- Contain: tell teachers AI generation is paused; manual editing keeps working (no dependency).
- Fix: wait or switch model via `EDU3D_OPENAI_MODEL` after verifying structured-output support.
- Verify: generate one outline in staging; re-run failed jobs from the UI.

## 3D provider outage / stuck generation job
- Detect: `three_d_asset_generation` jobs stay `retrying` with `PENDING`.
- Fix: jobs keep their `provider_task_id`, so `maintenance requeue-stuck --older-than-minutes 30`
  re-polls without creating (or billing) a new task. Polling gives up after 40 attempts.

## Queue backlog
- Detect: queued job count rising; `/health/ready` shows `queue: unavailable` if Redis is down.
- Fix: scale `worker` replicas; check Redis memory; then `requeue-stuck` for jobs left `processing`
  by crashed workers (handlers are idempotent).

## PDF extraction failure
- Detect: document `failed` with message (password-protected, too many pages, no text layer).
- Fix: ask the teacher for an unprotected/text PDF or paste text; scanned PDFs need OCR (not yet
  enabled).

## Invalid GLB output / upload
- Detect: `INVALID_ASSET` / `INVALID_MODEL` with the validator message.
- Fix: re-export as binary glTF 2.0 with embedded buffers/textures, no Draco, within budgets.

## Database restore
- Use `scripts/restore_db.sh` into a **new** database, run `alembic upgrade head`, point a
  staging API at it, verify `/health/ready` and a login, then switch traffic. Record RPO/RTO.

## Compromised credentials
- User account: disable the user (`users.status = 'disabled'`) — all sessions stop immediately
  because every request checks the session and user status.
- Leaked `EDU3D_JWT_SECRET`: rotate in Secrets Manager and redeploy (invalidates all access
  tokens); revoke all refresh sessions (`UPDATE auth_sessions SET revoked_at = now()`).
- Leaked provider key: revoke at the provider, rotate the secret, review `ai_usage_records`.

## Unexpected AI cost spike
- Detect: `GET /courses/{id}/ai/usage`, `ai_usage_records` grouped by course/day.
- Contain: lower `EDU3D_AI_MAX_JOBS_PER_COURSE_PER_DAY` /
  `EDU3D_THREE_D_MAX_GENERATIONS_PER_USER_PER_DAY` and redeploy; audit log shows who requested.
