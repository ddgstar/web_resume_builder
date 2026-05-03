#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.deploy/logs"
PID_DIR="$ROOT_DIR/.deploy/pids"
URL_FILE="$ROOT_DIR/.deploy/public-url.txt"
APP_LOG="$LOG_DIR/app.log"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"

mkdir -p "$LOG_DIR" "$PID_DIR"
cd "$ROOT_DIR"

info() { printf "\033[1;34m==>\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33mWarning:\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31mError:\033[0m %s\n" "$1" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1
}

install_homebrew_if_needed() {
  if require_command brew; then return; fi
  warn "Homebrew is not installed. Installing Homebrew now. You may be asked for your macOS password."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

install_dependencies() {
  install_homebrew_if_needed
  if ! require_command node; then
    info "Installing Node.js"
    brew install node
  fi
  if ! require_command cloudflared; then
    info "Installing Cloudflare Tunnel"
    brew install cloudflared
  fi
}

ensure_env() {
  if [[ ! -f "$ROOT_DIR/Backend/.env" ]]; then
    info "Creating Backend/.env from Backend/.env.example"
    cp "$ROOT_DIR/Backend/.env.example" "$ROOT_DIR/Backend/.env"
  fi
  if [[ ! -f "$ROOT_DIR/FrontEnd/.env" && -f "$ROOT_DIR/FrontEnd/.env.example" ]]; then
    info "Creating FrontEnd/.env from FrontEnd/.env.example"
    cp "$ROOT_DIR/FrontEnd/.env.example" "$ROOT_DIR/FrontEnd/.env"
  fi
}

stop_pid_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then return; fi
  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
  fi
  rm -f "$file"
}

wait_for_url() {
  local deadline=$((SECONDS + 45))
  while (( SECONDS < deadline )); do
    local url
    url="$(grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -1 || true)"
    if [[ -n "$url" ]]; then
      printf "%s\n" "$url" > "$URL_FILE"
      printf "\n\033[1;32mAutoResumeBuilder is live:\033[0m %s\n\n" "$url"
      return
    fi
    sleep 1
  done
  warn "Cloudflare tunnel started, but the public URL was not detected yet."
  warn "Check the tunnel log: $TUNNEL_LOG"
}

info "Preparing AutoResumeBuilder Web for global access without port forwarding"
install_dependencies
ensure_env

info "Installing project dependencies"
npm run install:all

info "Initializing local database"
npm run db:init

info "Stopping any previous local deployment"
stop_pid_file "$PID_DIR/app.pid"
stop_pid_file "$PID_DIR/cloudflared.pid"
rm -f "$URL_FILE"

info "Starting frontend and backend supervisor"
nohup npm run dev > "$APP_LOG" 2>&1 &
printf "%s" "$!" > "$PID_DIR/app.pid"

info "Waiting for frontend to become healthy"
for _ in {1..45}; do
  if curl -fsS "http://localhost:5173" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://localhost:5173" >/dev/null 2>&1 || fail "Frontend did not become ready. Check $APP_LOG"

info "Starting Cloudflare Tunnel"
nohup cloudflared tunnel --url "http://localhost:5173" --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
printf "%s" "$!" > "$PID_DIR/cloudflared.pid"

wait_for_url

cat <<EOF
Useful commands:
  Status: ./scripts/deploy-status.sh
  Stop:   ./scripts/deploy-stop.sh
  Logs:   tail -f "$APP_LOG" "$TUNNEL_LOG"

Important:
  Keep this MacBook awake and connected to the internet.
  If you need a permanent custom domain instead of a trycloudflare.com URL,
  use a named Cloudflare Tunnel later.
EOF
