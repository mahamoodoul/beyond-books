# Continuous deployment from GitHub Actions, without long-lived AWS keys: the workflow
# (.github/workflows/deploy-aws.yml) assumes this role through GitHub's OIDC provider and may
# only send SSM commands to this one instance (and start it when it is stopped). Set
# github_repository = "" to create none of this.

data "aws_caller_identity" "current" {}

locals {
  cicd              = var.github_repository != "" && var.github_auth != "none"
  cicd_oidc         = local.cicd && var.github_auth == "oidc"
  cicd_key          = local.cicd && var.github_auth == "access_key"
  oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : try(aws_iam_openid_connect_provider.github[0].arn, "")
  # Who may assume the role: pushes to the deploy branches, and jobs bound to the GitHub
  # environment "aws-<environment>" (deploy-aws.yml and rollback-aws.yml use it).
  github_subjects = concat(
    [for b in var.github_deploy_branches : "repo:${var.github_repository}:ref:refs/heads/${b}"],
    ["repo:${var.github_repository}:environment:aws-${var.environment}"],
  )
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = local.cicd_oidc && var.github_oidc_provider_arn == "" ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_policy_document" "github_assume" {
  count = local.cicd_oidc ? 1 : 0
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subjects
    }
  }
}

data "aws_iam_policy_document" "github_deploy" {
  count = local.cicd ? 1 : 0
  statement {
    sid     = "RunOnThisInstance"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}",
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }
  statement {
    sid       = "ReadResults"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands", "ssm:DescribeInstanceInformation"]
    resources = ["*"]
  }
  statement {
    sid       = "SeeInstance"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"]
    resources = ["*"]
  }
  statement {
    sid       = "StartStoppedInstance"
    actions   = ["ec2:StartInstances"]
    resources = ["arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}"]
  }
}

resource "aws_iam_role" "github_deploy" {
  count                = local.cicd_oidc ? 1 : 0
  name                 = "${local.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_assume[0].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = local.cicd_oidc ? 1 : 0
  name   = "${local.name}-github-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}

# Fallback for accounts whose organisation policy forbids OIDC providers: a user with the same
# narrow policy and one access key, stored as GitHub secrets. Rotate with
# `terraform taint aws_iam_access_key.github_deploy[0]` + apply, then update the secrets.
resource "aws_iam_user" "github_deploy" {
  count = local.cicd_key ? 1 : 0
  name  = "${local.name}-github-deploy"
  tags  = { purpose = "github-actions deploy over SSM" }
}

resource "aws_iam_user_policy" "github_deploy" {
  count  = local.cicd_key ? 1 : 0
  name   = "${local.name}-github-deploy"
  user   = aws_iam_user.github_deploy[0].name
  policy = data.aws_iam_policy_document.github_deploy[0].json
}

resource "aws_iam_access_key" "github_deploy" {
  count = local.cicd_key ? 1 : 0
  user  = aws_iam_user.github_deploy[0].name
}

output "github_secrets" {
  description = "With github_auth = access_key: set these as secrets of the GitHub environment (never print them; pipe into `gh secret set`)."
  sensitive   = true
  value = local.cicd_key ? {
    AWS_ACCESS_KEY_ID     = aws_iam_access_key.github_deploy[0].id
    AWS_SECRET_ACCESS_KEY = aws_iam_access_key.github_deploy[0].secret
  } : null
}

output "github_variables" {
  description = "Set these as variables of the GitHub environment aws-<environment> (Settings > Environments) for deploy-aws.yml / rollback-aws.yml."
  value = local.cicd ? {
    AWS_DEPLOY_ROLE_ARN = local.cicd_oidc ? aws_iam_role.github_deploy[0].arn : ""
    AWS_REGION          = var.region
    AWS_INSTANCE_ID     = aws_instance.app.id
    PUBLIC_URL          = local.public_url
  } : null
}
