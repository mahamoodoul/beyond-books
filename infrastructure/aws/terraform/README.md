# Beyond Books on AWS (one instance, credit-friendly)

Terraform for the simplest production-shaped deployment: **one EC2 instance** running the Docker
Compose stack (Caddy with TLS, frontend, API, worker, Postgres, Redis and optionally Blender),
a **private S3 bucket** for uploads and 3D models, **Secrets Manager** for generated secrets,
**SSM Session Manager** for shell access (no SSH keys needed), free **CloudWatch alarms** and an
**AWS Budget** e-mail. No NAT gateway, no load balancer, no RDS: those cost money while idle and
are not needed for a demo or a first pilot.

```
browser ──80/443──▶ Caddy ──▶ nginx (SPA, /api proxy) ──▶ api :8000 ──▶ Postgres / Redis
                                                     └──▶ worker ──▶ Blender :9876 (private)
                                      S3 (uploads, models, nightly dumps)   Secrets Manager
```

## Cost (eu-north-1, on-demand, rough)

| Item | Per hour | Per month nonstop | Notes |
|---|---|---|---|
| m7i-flex.large (2 vCPU, 8 GB) | ~0.09 USD | ~65 USD | default: the largest type a free-plan account may launch; whole stack incl. Blender, with 4 GB swap |
| t3.xlarge (4 vCPU, 16 GB) | 0.18 USD | ~130 USD | paid accounts: comfortable headroom for Blender |
| 40 GB gp3 disk | | ~3.5 USD | billed while stopped too |
| Elastic IP | | 0 while attached to a running instance, ~3.6 USD/month while stopped | |
| S3, Secrets Manager, alarms, budget | | < 1 USD | |

**Cost guard (automatic).** Two AWS Budgets watch the account: *net* (what you pay after credits)
and *gross* (what the usage costs before credits). You get e-mails (to `budget_alert_email`) at 25 %, 50 % and 80 % forecast (low, medium, high)
and 100 % actual of `monthly_budget_usd` for both. When the **net** cost passes 100 %, that is when the
credits are finished and real money is being spent, AWS Budgets **stops the instance** by itself
(`stop_instance_at_budget = true`) and mails you. Budgets refresh a few times a day, so expect the
stop within hours, not minutes; the gross e-mails are the early warning. A stopped instance keeps
its disk, data and IP; start it again with the command from `terraform output stop_start` (the
deploy pipeline refuses to start a stopped instance unless you tick *start_instance*). Raise the
cap with `monthly_budget_usd` and `terraform apply`.

On the credit-based free tier (100 to 200 USD, 6 months) a t3.xlarge used 8 hours a day lasts
for months. Set `budget_alert_email` and you get mail at 50 / 80 / 100 % of `monthly_budget_usd`.

Accounts on the **new AWS free plan** (credits, 6 months) can only launch free-tier-eligible
instance types (`aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true`);
anything else fails with *not eligible for Free Tier*. Upgrading the account to a paid plan lifts
that limit while keeping the remaining credits.

## Prerequisites

- An AWS account and the AWS CLI configured (`aws sts get-caller-identity` works).
- Terraform >= 1.6.
- Optional: a domain you control (for HTTPS) and, if AWS hosts its DNS, the Route 53 zone id.

## Deploy

```bash
cd infrastructure/aws/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in keys, e-mail, domain
terraform init
terraform plan                                   # read it: ~25 resources, nothing shared
terraform apply
```

`terraform output` prints the URL, the Elastic IP, the SSM shell command and the stop/start
commands. The first boot takes 5 to 10 minutes: it installs Docker, clones `git_ref`, writes the
env file from Secrets Manager, builds the images, runs migrations and the demo seed. Follow it with:

```bash
aws ssm start-session --region eu-north-1 --target <instance id>
sudo tail -f /var/log/beyond-books-boot.log
```

With a `domain`, create the DNS A record to the Elastic IP (or set `hosted_zone_id` and Terraform
does it); Caddy fetches the certificate within a minute of the name resolving. Without a domain
the app answers on `http://<elastic ip>`; cookies are then not marked secure, which is fine for a
demo and wrong for real users.

## Day to day

| Task | How |
|---|---|
| Budget reached, instance stopped | Read the e-mail, decide: start it (`terraform output stop_start`) or leave it. Nothing is lost. |
| Stop paying while idle | `terraform output stop_start`, run the stop command; start again before the demo. Data and IP stay. |
| Deploy a new commit | push to `aws-dev` (pipeline), or SSM shell + `sudo beyond-books deploy [sha]`. See CI/CD below. |
| Logs | `cd /opt/beyond-books && sudo docker compose --env-file .env.aws -f docker-compose.aws.yml logs -f api` |
| Backups | nightly `pg_dump` to `s3://<bucket>/backups/`, kept `backup_retention_days`. Restore with `scripts/restore_db.sh`. |
| Rotate a secret | `terraform taint random_password.jwt` (or `.postgres`), `terraform apply`, then redeploy. Rotating the Postgres password needs a password change in the database too. |
| Bigger box for a session | stop, change `instance_type`, `terraform apply`, start. The disk and data stay. |
| Tear down | `terraform destroy` (dev: the bucket is emptied; prod: it refuses while objects exist). |

## CI/CD and rollback

```
push to aws-dev ──▶ GitHub Actions: CI checks ──▶ assume IAM role (OIDC, no keys)
                 ──▶ SSM: `beyond-books deploy <sha>` on the instance
                        1. pg_dump to s3://<bucket>/backups/predeploy-<sha>-….dump
                        2. git checkout <sha>, docker compose up --build
                        3. health check: api ready + frontend + Caddy edge (up to 7 min)
                        4. ok  → record release, prune images        → "DEPLOYED <sha>"
                           bad → checkout previous sha, rebuild, re-check → "ROLLED BACK to <sha>"
                 ──▶ smoke test of PUBLIC_URL/api/v1/health/ready from the runner
```

Workflows: [`deploy-aws.yml`](../../../.github/workflows/deploy-aws.yml) (push to `aws-dev`, or
*Run workflow* with any commit) and [`rollback-aws.yml`](../../../.github/workflows/rollback-aws.yml)
(*Run workflow*: previous release or a chosen commit, schema kept or downgraded). Both run through
the composite action `.github/actions/ssm-run`, so the instance needs no SSH port, no deploy key
and no GitHub runner. Deploys are serialised (`concurrency: deploy-aws`); the instance also holds
a lock, so a manual and a pipeline deploy never overlap.

One-time setup after `terraform apply`:

1. `terraform output github_variables`.
2. GitHub → Settings → Environments → **aws-dev** (create it) → add those four variables.
   Optional: required reviewers on the environment = manual approval before every deploy.
3. Push to `aws-dev` (or run the workflow). The role trusts only this repository, the branches in
   `github_deploy_branches` and the environment `aws-<environment>`.

Rollback options, from fastest to most thorough:

| Situation | Do |
|---|---|
| Deploy failed its health check | Nothing: the pipeline already rolled back (job is red, summary says `ROLLED BACK to …`). |
| Release is healthy but wrong | Actions → *Rollback AWS* → *Run workflow* (empty sha = previous release). Or from an SSM shell: `sudo beyond-books rollback`. |
| Back to a specific commit | Same workflow with the sha, or `sudo beyond-books rollback <sha>`. |
| The release added a migration you must undo | Workflow with db = `downgrade` (runs `alembic downgrade` to the revision that release used, with a dump first). Default keeps the schema: this repo's migrations are additive, old code runs on a newer schema. |
| Data damaged | `sudo CONFIRM_RESTORE=yes beyond-books restore backups/predeploy-<sha>-….dump` (list with `aws s3 ls s3://<bucket>/backups/`). Stops api/worker, restores, starts them. |
| See what runs | `sudo beyond-books status` (current/previous sha, db revision, last releases, container health). |

The Terraform layer has its own rollback: state is versioned when kept in S3 (`backend.hcl.example`),
and an infrastructure change is reverted by `git revert` + `terraform apply`. Secrets and the
bucket are never destroyed by a deploy.

## Security notes

- The deploy role GitHub assumes can only send SSM commands to this instance and start it; it holds no keys and no S3 or secret access.
- Only 80 and 443 are open to the world. SSH (22) opens only to `admin_cidr` when you set it;
  otherwise use Session Manager, which is logged in CloudTrail.
- Blender's MCP socket (9876) runs arbitrary Python. It is reachable only inside the Docker
  network, never published, and the generator is enabled in production only through
  `EDU3D_BLENDER_ALLOW_IN_PRODUCTION` (Terraform sets it from `enable_blender`).
- Secrets live in Secrets Manager; the instance reads them with its role. The env file on disk is
  root-only. Nothing secret is in the repository or in Terraform state except the values you put
  in `terraform.tfvars` (git-ignored) and the state file itself: keep the state in S3 with
  encryption (`backend.hcl.example`) once more than one person applies.
- IMDSv2 only, encrypted disk, unattended security updates, fail2ban.

## What this is not

Not multi-AZ, not auto-scaling, one Postgres on local disk with nightly dumps. For a real term
with many classes: RDS for Postgres, the API on ECS/Fargate behind an ALB, Blender on its own
small instance, as sketched in `docs/INFRASTRUCTURE_AND_DEPLOYMENT.md`. The Terraform here is the
first step of that path, not a dead end: the bucket, secret and IAM shape carry over.
