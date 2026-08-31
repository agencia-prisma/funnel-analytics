#!/usr/bin/env bash
set -euo pipefail

EXCLUDED_SERVICES="realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"

for attempt in 1 2 3; do
  echo "Starting isolated Supabase (attempt ${attempt}/3)..."

  if pnpm supabase start -x "${EXCLUDED_SERVICES}"; then
    exit 0
  fi

  echo "Supabase start failed; cleaning local resources before retry."
  pnpm supabase stop --no-backup || true

  if [ "${attempt}" -lt 3 ]; then
    sleep "$((attempt * 10))"
  fi
done

echo "Failed to start isolated Supabase after 3 attempts."
exit 1
