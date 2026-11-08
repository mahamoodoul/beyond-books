# ------------------------------------------------------------------ identity
variable "project" {
  description = "Short name used in resource names and tags."
  type        = string
  default     = "beyond-books"
}

variable "environment" {
  description = "dev | staging | prod: goes into names, tags and EDU3D_ENVIRONMENT."
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

variable "region" {
  description = "AWS region. Stockholm is closest to Oslo and matches the app's S3 default."
  type        = string
  default     = "eu-north-1"
}

# ------------------------------------------------------------------ machine
variable "instance_type" {
  description = "EC2 type. Accounts on the new AWS free plan may only launch free-tier-eligible types: in eu-north-1 the largest is m7i-flex.large (2 vCPU, 8 GB), which runs the whole stack incl. Blender with swap. Paid plans: t3.xlarge (4 vCPU, 16 GB) is comfortable."
  type        = string
  default     = "m7i-flex.large"
}

variable "root_volume_gb" {
  description = "Root disk (gp3). Docker images, Postgres data and Blender need more than the 8 GB default."
  type        = number
  default     = 40
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH (port 22). Leave empty to keep SSH closed and use SSM Session Manager only."
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Optional SSH public key for the ubuntu user. Empty = no key pair (SSM still works)."
  type        = string
  default     = ""
}

# ------------------------------------------------------------------ app
variable "git_repo" {
  description = "Repository cloned on the instance."
  type        = string
  default     = "https://github.com/mahamoodoul/beyond-books.git"
}

variable "git_ref" {
  description = "Branch or tag deployed."
  type        = string
  default     = "aws-dev"
}

variable "domain" {
  description = "Public hostname (e.g. app.beyondbooks.no). Empty = serve on the Elastic IP over plain HTTP (demo only)."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone for `domain`. Empty = you create the DNS A record yourself."
  type        = string
  default     = ""
}

variable "enable_blender" {
  description = "Run the Blender container (Claude + Blender 3D generator). Needs >= 8 GB RAM."
  type        = bool
  default     = true
}

variable "demo_mode" {
  description = "Visitors enter as demo teacher/student without signing in (hackathon demo)."
  type        = bool
  default     = true
}

variable "seed_demo_data" {
  description = "Load the shared courses, labs, demo accounts and analytics students on every start."
  type        = bool
  default     = true
}

variable "seed_teacher_email" {
  type    = string
  default = "teacher@example.com"
}

variable "seed_teacher_password" {
  description = "12+ characters, must pass the app's password rules (not containing the email)."
  type        = string
  default     = "teacher-demo-123"
  sensitive   = true
}

variable "seed_student_email" {
  type    = string
  default = "student@example.com"
}

variable "seed_student_password" {
  type      = string
  default   = "student-demo-123"
  sensitive = true
}

# ------------------------------------------------------------------ AI keys (stored in Secrets Manager)
variable "anthropic_api_key" {
  description = "Claude API key. Empty = the offline fake providers (demo without AI)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "anthropic_model" {
  type    = string
  default = "claude-opus-5-5"
}

variable "elevenlabs_api_key" {
  description = "Optional, for lesson narration."
  type        = string
  default     = ""
  sensitive   = true
}

# ------------------------------------------------------------------ money
variable "budget_alert_email" {
  description = "Where AWS Budgets sends alerts. Empty = no budget created."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly cap in USD. E-mails at 25/50/80% forecast (low, medium, high) and 100% actual; with stop_instance_at_budget the instance is stopped when what you PAY (after credits) passes 100%."
  type        = number
  default     = 20
}

variable "stop_instance_at_budget" {
  description = "Stop the instance automatically when the net monthly cost reaches monthly_budget_usd (AWS Budgets action)."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Nightly Postgres dumps in S3 are deleted after this many days."
  type        = number
  default     = 30
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy through OIDC. Empty = no CI/CD role."
  type        = string
  default     = "mahamoodoul/beyond-books"
}

variable "github_deploy_branches" {
  description = "Branches whose pushes may assume the deploy role (besides the aws-<environment> GitHub environment)."
  type        = list(string)
  default     = ["aws-dev"]
}

variable "github_oidc_provider_arn" {
  description = "ARN of an existing GitHub OIDC provider in the account (one per account). Empty = create it."
  type        = string
  default     = ""
}

variable "github_auth" {
  description = "How GitHub Actions authenticates: oidc (role, preferred), access_key (IAM user + key, for accounts whose SCP forbids OIDC providers), none."
  type        = string
  default     = "oidc"
  validation {
    condition     = contains(["oidc", "access_key", "none"], var.github_auth)
    error_message = "github_auth must be oidc, access_key or none."
  }
}

variable "aws_profile" {
  description = "Named AWS CLI profile to use (empty = the default credential chain / AWS_PROFILE)."
  type        = string
  default     = ""
}
