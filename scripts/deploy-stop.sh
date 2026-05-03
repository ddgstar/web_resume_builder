#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.deploy/pids"

stop_pid_file() {
  local label="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    printf "%s is not running.\n" "$label"
    return
  fi
  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    printf "Stopping %s pid=%s...\n" "$label" "$pid"
    kill "$pid" >/dev/null 2>&1 || true
  else
    printf "%s pid file exists, but process is not running.\n" "$label"
  fi
  rm -f "$file"
}

stop_pid_file "AutoResumeBuilder app" "$PID_DIR/app.pid"
stop_pid_file "Cloudflare tunnel" "$PID_DIR/cloudflared.pid"

printf "Stopped local deployment.\n"
