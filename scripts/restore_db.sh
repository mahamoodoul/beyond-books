#!/usr/bin/env bash
# Restore a backup made by backup_db.sh into an EMPTY or disposable database.
#   TARGET_DATABASE_URL=postgresql://... CONFIRM_RESTORE=yes scripts/restore_db.sh backups/edu3d-....dump
# Afterwards: run `alembic upgrade head` (no-op if versions match) and smoke-test /api/v1/health/ready.
set -euo pipefail
dump="${1:?path to .dump file}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "Refusing to restore without CONFIRM_RESTORE=yes (this overwrites objects in the target)." >&2
  exit 1
fi
if [[ -f "$dump.sha256" ]]; then
  (cd "$(dirname "$dump")" && (sha256sum -c "$(basename "$dump").sha256" 2>/dev/null || shasum -a 256 -c "$(basename "$dump").sha256"))
fi
psql "$TARGET_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS vector;"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_DATABASE_URL" "$dump"
echo "restore complete into target database"
