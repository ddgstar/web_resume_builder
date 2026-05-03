#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${AUTO_UPDATE_INTERVAL_SECONDS:-60}"

printf "[%s] GitHub auto-updater started. interval=%ss\n" "$(date -u +%FT%TZ)" "$INTERVAL_SECONDS"

while true; do
  if bash "$ROOT_DIR/scripts/update-production-from-git.sh"; then
    printf "[%s] update check completed\n" "$(date -u +%FT%TZ)"
  else
    printf "[%s] update check failed; will retry\n" "$(date -u +%FT%TZ)" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
