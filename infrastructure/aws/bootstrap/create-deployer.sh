#!/usr/bin/env bash
# One-time: create the IAM user that runs Terraform for this project and store its key as the
# local AWS profile "beyond-books". Run it yourself with an admin profile; it prints the key id
# only, never the secret (that goes straight into ~/.aws/credentials, mode 600).
#
#   AWS_PROFILE=default infrastructure/aws/bootstrap/create-deployer.sh
#
# Afterwards:  AWS_PROFILE=beyond-books terraform -chdir=infrastructure/aws/terraform plan
# Undo:        infrastructure/aws/bootstrap/create-deployer.sh --delete
set -euo pipefail
USER_NAME=${USER_NAME:-beyond-books-deployer}
PROFILE=${PROFILE:-beyond-books}
REGION=${REGION:-eu-north-1}
HERE=$(cd "$(dirname "$0")" && pwd)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
POLICY_ARN="arn:aws:iam::${ACCOUNT}:policy/${USER_NAME}"

if [ "${1:-}" = "--delete" ]; then
  for k in $(aws iam list-access-keys --user-name "$USER_NAME" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
    aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$k"; done
  aws iam detach-user-policy --user-name "$USER_NAME" --policy-arn "$POLICY_ARN" || true
  aws iam delete-user --user-name "$USER_NAME" && echo "deleted user $USER_NAME"
  aws iam delete-policy --policy-arn "$POLICY_ARN" && echo "deleted policy $POLICY_ARN"
  exit 0
fi

echo "account $ACCOUNT as $(aws sts get-caller-identity --query Arn --output text)"
if ! aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  aws iam create-policy --policy-name "$USER_NAME" --policy-document "file://$HERE/deployer-policy.json" \
    --description "Beyond Books: Terraform deployer (EC2, S3, Secrets Manager, SSM, alarms, budgets, Route53; IAM only for beyond-books-* roles)" >/dev/null
  echo "created policy $POLICY_ARN"
fi
if ! aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  aws iam create-user --user-name "$USER_NAME" --tags Key=project,Value=beyond-books Key=purpose,Value=terraform-deployer >/dev/null
  echo "created user $USER_NAME"
fi
aws iam attach-user-policy --user-name "$USER_NAME" --policy-arn "$POLICY_ARN"

existing=$(aws iam list-access-keys --user-name "$USER_NAME" --query 'length(AccessKeyMetadata)' --output text)
if [ "$existing" != "0" ] && [ "${ROTATE:-}" != "yes" ]; then
  echo "user already has an access key; re-run with ROTATE=yes to create a new one (old keys are kept, delete them in IAM)"
else
  KEY_JSON=$(aws iam create-access-key --user-name "$USER_NAME" --output json) python3 - "$PROFILE" "$REGION" <<'PY'
import configparser, json, os, stat, sys
profile, region = sys.argv[1], sys.argv[2]
k = json.loads(os.environ["KEY_JSON"])["AccessKey"]
home = os.path.expanduser("~/.aws"); os.makedirs(home, exist_ok=True)
cred = configparser.ConfigParser(); cred.read(f"{home}/credentials")
cred[profile] = {"aws_access_key_id": k["AccessKeyId"], "aws_secret_access_key": k["SecretAccessKey"]}
with open(f"{home}/credentials", "w") as f: cred.write(f)
os.chmod(f"{home}/credentials", stat.S_IRUSR | stat.S_IWUSR)
conf = configparser.ConfigParser(); conf.read(f"{home}/config")
conf[f"profile {profile}"] = {"region": region, "output": "json"}
with open(f"{home}/config", "w") as f: conf.write(f)
print(f"profile '{profile}' written to ~/.aws (key id {k['AccessKeyId']}); the secret was not printed")
PY
fi
sleep 5  # IAM is eventually consistent
AWS_PROFILE=$PROFILE aws sts get-caller-identity --output text && echo "profile $PROFILE works"
