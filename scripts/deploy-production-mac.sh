#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"
cd "$ROOT_DIR"

start_auto_updater_if_possible() {
  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    warn "This folder is not a Git checkout, so automatic GitHub updates were not started."
    return
  fi
  if ! git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
    warn "No Git origin remote configured, so automatic GitHub updates were not started."
    return
  fi

  info "Starting GitHub auto-updater"
  stop_pid_file "$PID_DIR/git-updater.pid"
  nohup bash "$ROOT_DIR/scripts/github-auto-update.sh" > "$UPDATER_LOG" 2>&1 &
  printf "%s" "$!" > "$PID_DIR/git-updater.pid"
}

info "Preparing AutoResumeBuilder production deployment for a MacBook behind a router"
install_system_dependencies
ensure_env
install_project_dependencies
build_project
start_production_app
wait_for_app
start_cloudflare_tunnel
start_auto_updater_if_possible

cat <<EOF
Useful commands:
  Status:      npm run prod:status
  Update now:  npm run prod:update
  Stop:        npm run prod:stop
  App logs:    tail -f "$APP_LOG"
  Tunnel logs: tail -f "$TUNNEL_LOG"
  Update logs: tail -f "$UPDATER_LOG"

Important:
  Keep this MacBook awake and connected to the internet.
  Temporary trycloudflare.com URLs change after tunnel restarts.
  For a permanent URL, run: npm run prod:setup-url
EOF
