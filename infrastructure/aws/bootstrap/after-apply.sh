#!/usr/bin/env bash
# After `terraform apply`: wire GitHub Actions to the new instance and wait for the first boot.
#   1. creates the GitHub environment "aws-<environment>" and sets its variables (and, with
#      github_auth = access_key, the two secrets) from the Terraform outputs; secrets are piped
#      straight from Terraform into gh and never printed;
#   2. waits until the instance is online in SSM and the first boot has finished;
#   3. prints the URL and the demo accounts.
#
#   AWS_PROFILE=default infrastructure/aws/bootstrap/after-apply.sh
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
TF="terraform -chdir=$ROOT/infrastructure/aws/terraform"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
ENV_NAME="aws-$($TF output -json github_variables >/dev/null 2>&1 && grep -E '^environment' "$ROOT/infrastructure/aws/terraform/terraform.tfvars" | sed -E 's/.*"(.*)"/\1/' || echo dev)"
ENV_NAME=${ENV_NAME:-aws-dev}

echo "== GitHub environment $ENV_NAME in $REPO"
gh api -X PUT "repos/$REPO/environments/$ENV_NAME" >/dev/null
for key in AWS_DEPLOY_ROLE_ARN AWS_REGION AWS_INSTANCE_ID PUBLIC_URL; do
  val=$($TF output -json github_variables | python3 -c "import json,sys; print(json.load(sys.stdin).get('$key',''))")
  if [ -n "$val" ]; then
    printf '%s' "$val" | gh variable set "$key" --env "$ENV_NAME" --repo "$REPO"
    echo "  var $key = $val"
  else
    gh variable delete "$key" --env "$ENV_NAME" --repo "$REPO" >/dev/null 2>&1 || true
    echo "  var $key unset (empty)"
  fi
done
if $TF output -json github_secrets 2>/dev/null | grep -q AWS_ACCESS_KEY_ID; then
  for key in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    $TF output -json github_secrets | python3 -c "import json,sys; print(json.load(sys.stdin)['$key'])" \
      | gh secret set "$key" --env "$ENV_NAME" --repo "$REPO"
    echo "  secret $key set"
  done
fi

INSTANCE=$($TF output -raw instance_id); REGION=$($TF output -json github_variables | python3 -c "import json,sys; print(json.load(sys.stdin)['AWS_REGION'])")
URL=$($TF output -raw url)
echo "== waiting for $INSTANCE to come online in SSM"
for _ in $(seq 1 60); do
  ping=$(aws ssm describe-instance-information --region "$REGION" --filters "Key=InstanceIds,Values=$INSTANCE" --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
  [ "$ping" = Online ] && break; sleep 10
done
echo "== waiting for the first boot (Docker build, migrations, seed: 5-10 min)"
for _ in $(seq 1 90); do
  if curl -fsS --max-time 5 "$URL/api/v1/health/ready" >/dev/null 2>&1; then echo "ready: $URL"; break; fi
  sleep 10
done
cmd=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
      --parameters 'commands=["tail -n 15 /var/log/beyond-books-boot.log; beyond-books status || true"]' --query Command.CommandId --output text)
sleep 8
aws ssm get-command-invocation --region "$REGION" --command-id "$cmd" --instance-id "$INSTANCE" --query StandardOutputContent --output text
echo
echo "URL:      $URL"
echo "Teacher:  $(grep -E '^seed_teacher_email' "$ROOT/infrastructure/aws/terraform/terraform.tfvars" 2>/dev/null | sed -E 's/.*"(.*)"/\1/' || echo teacher@example.com)  (password: SEED_TEACHER_PASSWORD in Secrets Manager / tfvars)"
echo "Pipeline: every push to aws-dev now deploys; Actions → 'Deploy to AWS' → Run workflow for a manual one."
