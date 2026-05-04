#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

status_pid() {
  local label="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    printf "%-24s not running\n" "$label"
    return
  fi
  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    printf "%-24s running pid=%s\n" "$label" "$pid"
  else
    printf "%-24s pid file exists, but process is not running\n" "$label"
  fi
}

status_pid "Production app" "$PID_DIR/app.pid"
launchd_app_status
status_pid "Cloudflare tunnel" "$PID_DIR/cloudflared.pid"
status_pid "GitHub updater" "$PID_DIR/git-updater.pid"

if [[ -f "$URL_FILE" ]]; then
  printf "Public URL: %s\n" "$(cat "$URL_FILE")"
else
  printf "Public URL: not available yet\n"
fi

if curl -fsS "http://127.0.0.1:8080/api/health" >/dev/null 2>&1; then
  printf "Local API:  healthy\n"
else
  printf "Local API:  not responding\n"
fi

if curl -fsS "http://127.0.0.1:8080" >/dev/null 2>&1; then
  printf "Local web:  healthy\n"
else
  printf "Local web:  not responding\n"
fi

if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf "Git branch: %s\n" "$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
  printf "Git commit: %s\n" "$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
fi
