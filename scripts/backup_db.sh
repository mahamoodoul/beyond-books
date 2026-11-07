#!/usr/bin/env bash
# Logical backup of the Edu3D database (custom format, compressed).
#   DATABASE_URL=postgresql://user:pass@host:5432/edu3d scripts/backup_db.sh [out_dir]
# Store backups encrypted, off-host (e.g. S3 with SSE + lifecycle), and TEST restores regularly.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL (libpq form, postgresql://...)}"
out_dir="${1:-./backups}"
mkdir -p "$out_dir"
file="$out_dir/edu3d-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file "$file" "$DATABASE_URL"
sha256sum "$file" > "$file.sha256" 2>/dev/null || shasum -a 256 "$file" > "$file.sha256"
echo "backup written: $file"
