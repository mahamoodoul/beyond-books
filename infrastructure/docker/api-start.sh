#!/bin/sh
# API container start: run Alembic migrations (with retries), then serve.
# Kept in the image (not in compose) so the Coolify compose parser can't mangle it,
# and so migration errors land in the long-running api container's logs.
set -u

# Log the DB target without the password, to make misconfiguration obvious.
python - <<'PY'
from sqlalchemy.engine import make_url
from app.core.config import get_settings
u = make_url(get_settings().database_url)
print(f"[start] database: {u.drivername}://{u.username}:***@{u.host}:{u.port}/{u.database}"
      f" (user set: {bool(u.username)}, password set: {bool(u.password)})", flush=True)
PY

i=1
until alembic upgrade head; do
  if [ "$i" -ge 10 ]; then
    echo "[start] migrations failed after $i attempts; exiting" >&2
    exit 1
  fi
  echo "[start] migration attempt $i failed; retrying in 3s" >&2
  i=$((i + 1))
  sleep 3
done

echo "[start] migrations applied" >&2

# Idempotent: seeds the platform 3D library demo asset. Non-fatal so it never blocks the API.
python -m app.modules.three_d.seed || echo "[start] warning: 3D demo seed failed (continuing)" >&2

# Demo data: the shared courses, the demo teacher/student accounts and analytics students
# (scripts/seed_deploy.py). On in the Coolify demo deployment; idempotent, so it runs on every
# start and only adds what is missing. Registration is forced on for the seed only, so it also
# works when EDU3D_OPEN_REGISTRATION=false. Non-fatal so it never blocks the API.
if [ "${EDU3D_SEED_DEMO_DATA:-false}" = "true" ]; then
  EDU3D_OPEN_REGISTRATION=true python "${SEED_ROOT:-/app/seed}/scripts/seed_deploy.py" \
    || echo "[start] warning: demo data seed failed (continuing)" >&2
fi

echo "[start] starting uvicorn" >&2
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-2}" \
  --proxy-headers --forwarded-allow-ips='*'
