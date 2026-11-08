# Cost guard. Two budgets (the first two are free) and one automatic action:
#
#   <name>-net    what you actually PAY after credits (include_credit = true). At 100 % of
#                 monthly_budget_usd AWS Budgets runs the SSM "stop EC2 instances" action on the
#                 app instance and mails you. While free-tier credits still cover the usage this
#                 stays near 0, so in practice it fires when the credits are finished.
#   <name>-gross  what the usage costs before credits: 25 / 50 / 80 % forecast and 100 % actual e-mails,
#                 so you see the burn rate while the credits are absorbing it.
#
# Budgets data refreshes a few times a day, so the stop is not instant (hours, not minutes).
# After a stop: `terraform output stop_start` → start command, or raise monthly_budget_usd and
# apply. Disk, Elastic IP and S3 still cost a little while stopped (see README).

locals {
  budgets    = var.budget_alert_email != ""
  budget_cut = local.budgets && var.stop_instance_at_budget
}

resource "aws_budgets_budget" "net" {
  count        = local.budgets ? 1 : 0
  name         = "${local.name}-net"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = true
    include_refund             = true
    include_discount           = true
    use_amortized              = false
    include_subscription       = true
    include_tax                = true
    include_support            = true
    include_upfront            = true
    include_recurring          = true
    include_other_subscription = true
    use_blended                = false
  }

  dynamic "notification" {
    for_each = [25, 50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value == 100 ? "ACTUAL" : "FORECASTED"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}

resource "aws_budgets_budget" "gross" {
  count        = local.budgets ? 1 : 0
  name         = "${local.name}-gross"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = false
    include_refund             = false
    include_discount           = true
    use_amortized              = false
    include_subscription       = true
    include_tax                = true
    include_support            = true
    include_upfront            = true
    include_recurring          = true
    include_other_subscription = true
    use_blended                = false
  }

  dynamic "notification" {
    for_each = [25, 50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value == 100 ? "ACTUAL" : "FORECASTED"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}

# Role that AWS Budgets assumes to run the stop. AWS's own managed policy for exactly this.
data "aws_iam_policy_document" "budgets_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "budget_stop" {
  count              = local.budget_cut ? 1 : 0
  name               = "${local.name}-budget-stop"
  assume_role_policy = data.aws_iam_policy_document.budgets_assume.json
}

resource "aws_iam_role_policy_attachment" "budget_stop" {
  count      = local.budget_cut ? 1 : 0
  role       = aws_iam_role.budget_stop[0].name
  policy_arn = "arn:aws:iam::aws:policy/AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM"
}

resource "aws_budgets_budget_action" "stop_instance" {
  count              = local.budget_cut ? 1 : 0
  budget_name        = aws_budgets_budget.net[0].name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_stop[0].arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_EC2_INSTANCES"
      instance_ids    = [aws_instance.app.id]
      region          = var.region
    }
  }

  subscriber {
    address           = var.budget_alert_email
    subscription_type = "EMAIL"
  }

  depends_on = [aws_iam_role_policy_attachment.budget_stop]
}
