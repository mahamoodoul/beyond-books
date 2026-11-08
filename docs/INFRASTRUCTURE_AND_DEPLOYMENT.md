# Infrastructure and deployment

Pilot target: 50–100 users. Region, exact AWS services and budget are **open decisions #10 and
#12** — nothing here assumes a region or pricing.

## Artifacts

| Artifact | Built from | Notes |
|---|---|---|
| `backend` image | `infrastructure/docker/backend.prod.Dockerfile` | API (`uvicorn`, `WEB_CONCURRENCY` workers) **and** worker (`celery …` command). Non-root, JSON logs, `HEALTHCHECK` on `/api/v1/health`. |
| `frontend` image | `infrastructure/docker/frontend.nginx-template.Dockerfile` | Static SPA on nginx :8080, CSP + security headers, `/api` reverse proxy (`API_UPSTREAM`). |

`release.yml` builds both on a `v*` tag, smoke-tests the backend image (`/health/ready`) and pushes
to GHCR. `docker-compose.prod.yml` runs the whole stack on one host (staging or a small pilot):
`migrate` (Alembic + library seed) runs once before `api` starts.

## Configuration

All settings are `EDU3D_*` env vars (`backend/app/core/config.py`); see `.env.production.example`.
In AWS set `EDU3D_AWS_SECRET_ID` to load them from Secrets Manager (env vars still win).
Startup **refuses** staging/production when: JWT secret is default/short, cookies not `Secure`,
fake AI/3D providers selected, or jobs run inline. API docs are disabled automatically.

## Candidate AWS shape (decide with current prices and region)

- Containers: ECS on Fargate (or App Runner) — one service for `api`, one for `worker`.
- PostgreSQL: RDS for PostgreSQL 16 with `pgvector`; automated backups + PITR; encryption at rest.
- Redis: ElastiCache (or a small Redis task if cost matters at pilot scale).
- Storage: one **private** S3 bucket, Block Public Access on, SSE-S3/KMS, versioning; lifecycle
  rule to expire `courses/*/documents/*/source` objects per the agreed retention period.
  Add the bucket origin to `CONNECT_SRC_EXTRA` (CSP) and a CORS rule allowing `PUT`/`GET` from the
  app origin only.
- Edge: ALB with TLS (ACM) in front of the frontend container; optional CloudFront for `/assets/*`.
- Logs/metrics: CloudWatch (JSON logs already include `request_id`).
- No Kubernetes for the pilot (design §18).

## Release procedure

1. Merge to `main` (CI green: lint, types, tests, migrations up/down/up on Postgres, contracts).
2. Tag `vX.Y.Z` → `release.yml` builds, smoke-tests, pushes images.
3. Deploy to **staging**; run `migrate`; smoke test: login, open a course, open a 3D scene.
4. Approve production. Migrations must be backward compatible (expand → deploy → contract).
5. Deploy `api` and `worker`; watch `/api/v1/health/ready`, error rate, queue depth.
6. Rollback = redeploy the previous image tag (migrations are additive; never auto-downgrade
   production — restore from backup if a destructive migration ever goes wrong).

## Backups

`scripts/backup_db.sh` (pg_dump custom format + checksum) and `scripts/restore_db.sh` (refuses
without `CONFIRM_RESTORE=yes`). With RDS prefer automated snapshots + PITR, and still run a
**monthly restore test** into a scratch database; record the result in the runbook log.

## AWS, single instance (Terraform)

`infrastructure/aws/terraform/` deploys the whole stack on one EC2 instance with S3, Secrets
Manager, SSM access, alarms and a budget: see its README for cost, steps and operations. It uses
`docker-compose.aws.yml` (Caddy + frontend + api + worker + Postgres + Redis + optional Blender
container, `infrastructure/docker/blender.Dockerfile`). Blender in a container needs
`EDU3D_BLENDER_EXPORT_DIR` (a volume shared with the api/worker) and
`EDU3D_BLENDER_ALLOW_IN_PRODUCTION=true`; both are set by Terraform.
