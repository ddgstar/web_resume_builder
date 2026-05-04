#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

info "Installing resilient macOS launchd service"
ensure_env
start_production_app
wait_for_app

cat <<EOF
AutoResumeBuilder is now protected by macOS launchd.

What this means:
  - The backend starts automatically after this Mac signs in.
  - If the Node backend crashes, scripts/prod-supervisor.mjs restarts it.
  - If the supervisor crashes, macOS launchd restarts the supervisor.

Useful commands:
  Status:  npm run prod:status
  Restart: npm run prod:restart
  Stop:    npm run prod:stop
  Logs:    tail -f "$APP_LOG"
EOF
