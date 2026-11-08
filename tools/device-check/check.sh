#!/bin/sh
# Runs the whole device check: one fresh login session per device (tokens last 15 minutes),
# then the security checks and the report. Needs the backend on :8000 and the production build
# served by `npx vite preview --port 4173` in frontend/.
set -e
cd "$(dirname "$0")"
mkdir -p out
mint() { (cd ../../backend && .venv/bin/python ../tools/device-check/mint_sessions.py 2>/dev/null | grep '^{' > ../tools/device-check/out/sessions.json); }
for d in ${DEVICE_LIST:-laptop chromebook ipad-safari ipad-slow phone}; do
  mint
  DEVICES=$d node run.mjs
done
mint
node security.mjs
node fonts.mjs
node report.mjs
