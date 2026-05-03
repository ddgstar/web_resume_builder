#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.deploy/pids"
URL_FILE="$ROOT_DIR/.deploy/public-url.txt"

status_pid() {
  local label="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    printf "%-22s not running\n" "$label"
    return
  fi
  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    printf "%-22s running pid=%s\n" "$label" "$pid"
  else
    printf "%-22s pid file exists, but process is not running\n" "$label"
  fi
}

status_pid "Frontend/backend" "$PID_DIR/app.pid"
status_pid "Cloudflare tunnel" "$PID_DIR/cloudflared.pid"

if [[ -f "$URL_FILE" ]]; then
  printf "Public URL: %s\n" "$(cat "$URL_FILE")"
else
  printf "Public URL: not available yet\n"
fi

if curl -fsS "http://localhost:5173" >/dev/null 2>&1; then
  printf "Local frontend: healthy\n"
else
  printf "Local frontend: not responding\n"
fi

if curl -fsS "http://localhost:8080/api/health" >/dev/null 2>&1; then
  printf "Local backend:  healthy\n"
else
  printf "Local backend:  not responding\n"
fi
