#!/bin/bash
# Operations on the Beyond Books instance (installed as /usr/local/bin/beyond-books by the
# first-boot script and re-installed by every successful deploy).
#
#   beyond-books deploy [ref|sha] [--no-rollback] [--force]   build + start a commit, health-check,
#                                                            roll back to the previous one on failure
#   beyond-books rollback [sha] [--db keep|downgrade]         go back (default: the previous release)
#   beyond-books status                                       what runs, what ran before, health
#   beyond-books health [timeout-seconds]                     wait until api + frontend answer
#   beyond-books backup [prefix]                              pg_dump -> s3://<bucket>/backups/
#   beyond-books restore <s3 key|local file>                  restore a dump (asks for CONFIRM_RESTORE=yes)
#
# State lives in /var/lib/beyond-books: current, previous (sha + alembic revision), releases.log.
# Run through SSM by the GitHub Actions workflows (.github/workflows/deploy-aws.yml, rollback-aws.yml)
# or by hand from an SSM shell with sudo. Exit code 0 = the requested release is up; anything else =
# it is not (after a failed deploy the previous release is restored when possible, exit code 1).
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/beyond-books}
STATE_DIR=${STATE_DIR:-/var/lib/beyond-books}
BRANCH=$( [ -f /etc/beyond-books/branch ] && cat /etc/beyond-books/branch || echo main)
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-420}
COMPOSE=(docker compose --env-file "$APP_DIR/.env.aws" -f "$APP_DIR/docker-compose.aws.yml")
LOG=/var/log/beyond-books-deploy.log

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG" >&2; }
die() { log "ERROR: $*"; exit 1; }
need_root() { [ "$(id -u)" = 0 ] || die "run with sudo"; }
in_app() { cd "$APP_DIR"; }
short() { echo "${1:0:12}"; }
env_get() { grep -E "^$1=" "$APP_DIR/.env.aws" | tail -1 | cut -d= -f2-; }

db_revision() {
  # The alembic head applied in the database, or "unknown" while the api is down.
  "${COMPOSE[@]}" exec -T api alembic current 2>/dev/null | grep -oE '^[0-9a-f]{4,}' | head -1 || true
}

record() { # record <file> <sha> <revision>
  mkdir -p "$STATE_DIR"
  printf 'sha=%s\nrevision=%s\nat=%s\n' "$2" "$3" "$(date -u +%FT%TZ)" > "$STATE_DIR/$1"
}
read_state() { # read_state <file> <key>
  [ -f "$STATE_DIR/$1" ] && grep -E "^$2=" "$STATE_DIR/$1" | cut -d= -f2- || true
}
history() { echo "$(date -u +%FT%TZ) $*" >> "$STATE_DIR/releases.log"; }

# ---------------------------------------------------------------------------------------- health
cmd_health() {
  local timeout=${1:-$HEALTH_TIMEOUT} start now
  start=$(date +%s)
  in_app
  while :; do
    if "${COMPOSE[@]}" exec -T api python -c \
         "import urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/ready', timeout=5); sys.exit(0 if r.status==200 else 1)" \
         >/dev/null 2>&1 \
       && "${COMPOSE[@]}" exec -T frontend wget -qO- http://127.0.0.1:3939/ >/dev/null 2>&1 \
       && edge_ok; then
      log "healthy: api ready, frontend serving, edge answering"
      return 0
    fi
    now=$(date +%s)
    if [ $((now - start)) -ge "$timeout" ]; then
      log "not healthy after ${timeout}s"
      "${COMPOSE[@]}" ps >&2 || true
      "${COMPOSE[@]}" logs --tail=40 api >&2 || true
      return 1
    fi
    sleep 5
  done
}

edge_ok() {
  # Caddy on the host: 200 on plain http, or a redirect to https when a domain is configured.
  local domain code
  domain=$(env_get DOMAIN)
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "Host: ${domain:-localhost}" http://127.0.0.1/ || true)
  case "$code" in 200|301|308) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------------------------------- backup
cmd_backup() {
  need_root; in_app
  local prefix=${1:-edu3d} user db bucket region f
  user=$(env_get POSTGRES_USER); db=$(env_get POSTGRES_DB)
  bucket=$(env_get EDU3D_S3_BUCKET); region=$(env_get EDU3D_S3_REGION)
  f="${prefix}-$(date -u +%Y%m%dT%H%M%SZ).dump"
  "${COMPOSE[@]}" exec -T postgres pg_dump --format=custom --no-owner --no-privileges -U "$user" "$db" > "/tmp/$f"
  aws s3 cp "/tmp/$f" "s3://$bucket/backups/$f" --region "$region" --only-show-errors
  rm -f "/tmp/$f"
  log "backup: s3://$bucket/backups/$f"
  echo "backups/$f"
}

cmd_restore() {
  need_root; in_app
  local src=${1:?s3 key (backups/...) or local .dump file} user db bucket region local_file
  [ "${CONFIRM_RESTORE:-}" = yes ] || die "this overwrites the database; re-run with CONFIRM_RESTORE=yes"
  user=$(env_get POSTGRES_USER); db=$(env_get POSTGRES_DB)
  bucket=$(env_get EDU3D_S3_BUCKET); region=$(env_get EDU3D_S3_REGION)
  if [ -f "$src" ]; then local_file=$src; else
    local_file="/tmp/$(basename "$src")"
    aws s3 cp "s3://$bucket/$src" "$local_file" --region "$region" --only-show-errors
  fi
  "${COMPOSE[@]}" stop api worker >/dev/null
  "${COMPOSE[@]}" exec -T postgres psql -U "$user" -d "$db" -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
  "${COMPOSE[@]}" exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges -U "$user" -d "$db" < "$local_file"
  "${COMPOSE[@]}" start api worker >/dev/null
  log "restored $src; api and worker restarted (api-start re-applies migrations)"
  history "restore $src"
}

# ---------------------------------------------------------------------------------------- deploy
switch_to() { # switch_to <sha>: check out and (re)build + start; returns health result
  in_app
  git checkout -q --detach "$1"
  git lfs pull -q || true
  systemctl restart beyond-books.service
  cmd_health
}

cmd_deploy() {
  need_root; in_app
  local target="" rollback=1 force=0 a sha current cur_rev new_rev backup_key
  for a in "$@"; do
    case "$a" in
      --no-rollback) rollback=0 ;;
      --force) force=1 ;;
      -*) die "unknown option $a" ;;
      *) target=$a ;;
    esac
  done
  exec 9>/run/beyond-books.lock; flock -n 9 || die "another deploy or rollback is running"

  git fetch -q --prune origin
  if [ -z "$target" ]; then target="origin/$BRANCH"; fi
  sha=$(git rev-parse --verify -q "origin/$target^{commit}" 2>/dev/null || git rev-parse --verify -q "$target^{commit}" 2>/dev/null) \
    || die "cannot resolve '$target' (fetched origin)"
  current=$(git rev-parse HEAD)
  if [ "$sha" = "$current" ] && [ "$force" = 0 ]; then
    log "already running $(short "$sha"); nothing to do (use --force to rebuild)"
    cmd_health 60 && { echo "DEPLOYED $sha (unchanged)"; return 0; }
    log "running release is unhealthy; rebuilding it"
  fi

  cur_rev=$(db_revision); [ -n "$cur_rev" ] || cur_rev=unknown
  log "deploy $(short "$current") -> $(short "$sha") (db revision $cur_rev)"
  backup_key=$(cmd_backup "predeploy-$(short "$sha")") || { log "pre-deploy backup failed"; backup_key=none; }
  record previous "$current" "$cur_rev"
  history "deploy start from=$current to=$sha db=$cur_rev backup=$backup_key"

  if switch_to "$sha"; then
    new_rev=$(db_revision); [ -n "$new_rev" ] || new_rev=unknown
    record current "$sha" "$new_rev"
    history "deploy ok sha=$sha db=$new_rev"
    install -m 0755 "$APP_DIR/infrastructure/aws/scripts/beyond-books.sh" /usr/local/bin/beyond-books 2>/dev/null || true
    docker image prune -f >/dev/null 2>&1 || true
    log "deployed $(short "$sha") (db revision $cur_rev -> $new_rev)"
    echo "DEPLOYED $sha"
    return 0
  fi

  history "deploy FAILED sha=$sha"
  log "release $(short "$sha") failed its health check"
  if [ "$rollback" = 1 ] && [ "$current" != "$sha" ]; then
    log "rolling back to $(short "$current")"
    if do_rollback "$current" "$cur_rev" keep; then
      echo "ROLLED BACK to $current after failed deploy of $sha (pre-deploy backup: $backup_key)"
    else
      echo "ROLLBACK FAILED: $sha failed and $current could not be restored (pre-deploy backup: $backup_key)"
    fi
  fi
  return 1
}

# -------------------------------------------------------------------------------------- rollback
do_rollback() { # do_rollback <sha> <db revision of that release> <keep|downgrade>
  local sha=$1 rev=$2 mode=$3 now_rev
  in_app
  now_rev=$(db_revision)
  if [ "$mode" = downgrade ] && [ -n "$now_rev" ] && [ "$rev" != unknown ] && [ "$now_rev" != "$rev" ]; then
    # Downgrade with the CURRENT image (it knows the newer migration files), before switching code.
    log "alembic downgrade $now_rev -> $rev"
    cmd_backup "prerollback-$(short "$sha")" >/dev/null || true
    "${COMPOSE[@]}" exec -T api alembic downgrade "$rev" || die "alembic downgrade failed; database untouched beyond that point"
  elif [ -n "$now_rev" ] && [ "$rev" != unknown ] && [ "$now_rev" != "$rev" ]; then
    log "database is at revision $now_rev, the release you return to ran at $rev; keeping the schema (add --db downgrade to revert it)"
  fi
  if switch_to "$sha"; then
    record current "$sha" "$(db_revision)"
    history "rollback ok sha=$sha db-mode=$mode"
    return 0
  fi
  history "rollback FAILED sha=$sha"
  return 1
}

cmd_rollback() {
  need_root; in_app
  local target="" mode=keep rev a sha
  while [ $# -gt 0 ]; do
    case "$1" in
      --db) mode=${2:-keep}; shift ;;
      -*) die "unknown option $1" ;;
      *) target=$1 ;;
    esac
    shift
  done
  case "$mode" in keep|downgrade) ;; *) die "--db must be keep or downgrade" ;; esac
  exec 9>/run/beyond-books.lock; flock -n 9 || die "another deploy or rollback is running"

  if [ -z "$target" ]; then
    sha=$(read_state previous sha); rev=$(read_state previous revision)
    [ -n "$sha" ] || die "no previous release recorded; pass a commit sha"
  else
    git fetch -q --prune origin || true
    sha=$(git rev-parse --verify -q "$target^{commit}") || die "unknown commit '$target'"
    rev=$(grep -E " sha=$sha db=" "$STATE_DIR/releases.log" 2>/dev/null | tail -1 | grep -oE 'db=[^ ]+' | cut -d= -f2 || true)
    [ -n "$rev" ] || rev=unknown
  fi
  local from; from=$(git rev-parse HEAD)
  log "rollback $(short "$from") -> $(short "$sha") (db: $mode)"
  record previous "$from" "$(db_revision)"
  if do_rollback "$sha" "$rev" "$mode"; then
    echo "ROLLED BACK to $sha"
  else
    echo "ROLLBACK FAILED: $sha is not healthy"
    return 1
  fi
}

# ---------------------------------------------------------------------------------------- status
cmd_status() {
  in_app
  echo "running:  $(git rev-parse HEAD) ($(git log -1 --format='%cs %s' | cut -c1-80))"
  echo "db:       $(db_revision)"
  echo "previous: $(read_state previous sha) (db $(read_state previous revision), at $(read_state previous at))"
  echo "branch:   $BRANCH"
  echo "history:"; tail -5 "$STATE_DIR/releases.log" 2>/dev/null | sed 's/^/  /' || echo "  (none)"
  "${COMPOSE[@]}" ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null || true
  cmd_health 30 >/dev/null 2>&1 && echo "health:   ok" || { echo "health:   FAILING"; return 1; }
}

case "${1:-}" in
  deploy)   shift; cmd_deploy "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  status)   cmd_status ;;
  health)   shift; cmd_health "$@" ;;
  backup)   shift; cmd_backup "$@" ;;
  restore)  shift; cmd_restore "$@" ;;
  *) sed -n '2,15p' "$0"; exit 2 ;;
esac
