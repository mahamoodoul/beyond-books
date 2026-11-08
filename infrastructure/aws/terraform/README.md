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
| t3.xlarge (4 vCPU, 16 GB) | 0.18 USD | ~130 USD | stop it outside demo hours |
| t3.large (2 vCPU, 8 GB) | 0.09 USD | ~65 USD | fine without Blender |
| 40 GB gp3 disk | | ~3.5 USD | billed while stopped too |
| Elastic IP | | 0 while attached to a running instance, ~3.6 USD/month while stopped | |
| S3, Secrets Manager, alarms, budget | | < 1 USD | |

On the credit-based free tier (100 to 200 USD, 6 months) a t3.xlarge used 8 hours a day lasts
for months. Set `budget_alert_email` and you get mail at 50 / 80 / 100 % of `monthly_budget_usd`.

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
| Stop paying while idle | `terraform output stop_start`, run the stop command; start again before the demo. Data and IP stay. |
| Deploy a new commit | SSM shell, then `sudo beyond-books-deploy` (git pull, rebuild, restart). |
| Logs | `cd /opt/beyond-books && sudo docker compose --env-file .env.aws -f docker-compose.aws.yml logs -f api` |
| Backups | nightly `pg_dump` to `s3://<bucket>/backups/`, kept `backup_retention_days`. Restore with `scripts/restore_db.sh`. |
| Rotate a secret | `terraform taint random_password.jwt` (or `.postgres`), `terraform apply`, then redeploy. Rotating the Postgres password needs a password change in the database too. |
| Bigger box for a session | stop, change `instance_type`, `terraform apply`, start. The disk and data stay. |
| Tear down | `terraform destroy` (dev: the bucket is emptied; prod: it refuses while objects exist). |

## Security notes

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
