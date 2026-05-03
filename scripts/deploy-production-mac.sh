#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"
cd "$ROOT_DIR"

wait_for_url() {
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    local url
    url="$(grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -1 || true)"
    if [[ -n "$url" ]]; then
      printf "%s\n" "$url" > "$URL_FILE"
      printf "\n\033[1;32mAutoResumeBuilder production is live:\033[0m %s\n\n" "$url"
      return
    fi
    sleep 1
  done
  warn "Cloudflare tunnel started, but a public URL was not detected yet."
  warn "Check the tunnel log: $TUNNEL_LOG"
}

start_tunnel() {
  info "Starting Cloudflare Tunnel to local production app"
  stop_pid_file "$PID_DIR/cloudflared.pid"
  rm -f "$URL_FILE"
  nohup cloudflared tunnel --url "http://127.0.0.1:8080" --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
  printf "%s" "$!" > "$PID_DIR/cloudflared.pid"
  wait_for_url
}

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
start_tunnel
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
  The quick trycloudflare.com URL can change after tunnel restarts.
  For a permanent URL, use a named Cloudflare Tunnel with your domain.
EOF
