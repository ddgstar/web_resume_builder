#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.deploy/logs"
PID_DIR="$ROOT_DIR/.deploy/pids"
URL_FILE="$ROOT_DIR/.deploy/public-url.txt"
APP_LOG="$LOG_DIR/production-app.log"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
UPDATER_LOG="$LOG_DIR/git-updater.log"
LAUNCHD_LABEL="com.autoresumebuilder.web"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"

mkdir -p "$LOG_DIR" "$PID_DIR"

info() { printf "\033[1;34m==>\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33mWarning:\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31mError:\033[0m %s\n" "$1" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1; }

stop_pid_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then return; fi
  local pid
  pid="$(cat "$file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi
  rm -f "$file"
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  printf "%s" "$value"
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

install_system_dependencies() {
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
    info "Creating production Backend/.env"
    cp "$ROOT_DIR/Backend/.env.example" "$ROOT_DIR/Backend/.env"
  fi

  if ! grep -q '^NODE_ENV=' "$ROOT_DIR/Backend/.env"; then
    printf "\nNODE_ENV=production\n" >> "$ROOT_DIR/Backend/.env"
  else
    perl -0pi -e 's/^NODE_ENV=.*/NODE_ENV=production/m' "$ROOT_DIR/Backend/.env"
  fi

  if ! grep -q '^FRONTEND_DIST_DIR=' "$ROOT_DIR/Backend/.env"; then
    printf "FRONTEND_DIST_DIR=%s\n" "$ROOT_DIR/FrontEnd/dist" >> "$ROOT_DIR/Backend/.env"
  else
    FRONTEND_DIST_DIR_VALUE="$ROOT_DIR/FrontEnd/dist" perl -0pi -e 's|^FRONTEND_DIST_DIR=.*|FRONTEND_DIST_DIR=$ENV{FRONTEND_DIST_DIR_VALUE}|m' "$ROOT_DIR/Backend/.env"
  fi

  if [[ ! -f "$ROOT_DIR/FrontEnd/.env" ]]; then
    info "Creating production FrontEnd/.env"
    printf "VITE_API_BASE_URL=/api\n" > "$ROOT_DIR/FrontEnd/.env"
  else
    if grep -q '^VITE_API_BASE_URL=' "$ROOT_DIR/FrontEnd/.env"; then
      perl -0pi -e 's|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=/api|m' "$ROOT_DIR/FrontEnd/.env"
    else
      printf "\nVITE_API_BASE_URL=/api\n" >> "$ROOT_DIR/FrontEnd/.env"
    fi
  fi
}

install_project_dependencies() {
  info "Installing backend dependencies"
  if [[ -f "$ROOT_DIR/Backend/package-lock.json" ]]; then
    npm_ci_with_repair "$ROOT_DIR/Backend"
  else
    npm --prefix "$ROOT_DIR/Backend" install
  fi

  info "Installing frontend dependencies"
  if [[ -f "$ROOT_DIR/FrontEnd/package-lock.json" ]]; then
    npm_ci_with_repair "$ROOT_DIR/FrontEnd"
  else
    npm --prefix "$ROOT_DIR/FrontEnd" install
  fi
}

npm_ci_with_repair() {
  local package_dir="$1"
  if npm --prefix "$package_dir" ci; then
    return
  fi

  warn "npm ci failed in $package_dir. Repairing package-lock.json and retrying install."
  npm --prefix "$package_dir" install --package-lock-only
  npm --prefix "$package_dir" ci
}

build_project() {
  info "Initializing database"
  npm --prefix "$ROOT_DIR/Backend" run db:init
  info "Building backend and frontend"
  npm --prefix "$ROOT_DIR/Backend" run build
  npm --prefix "$ROOT_DIR/FrontEnd" run build
}

start_production_app() {
  info "Starting production app supervisor"
  if [[ "$(uname -s)" == "Darwin" && "${AUTORB_DISABLE_LAUNCHD:-0}" != "1" ]]; then
    install_launchd_app_service
    return
  fi

  start_production_app_nohup
}

start_production_app_nohup() {
  stop_launchd_app_service >/dev/null 2>&1 || true
  stop_pid_file "$PID_DIR/app.pid"
  nohup node "$ROOT_DIR/scripts/prod-supervisor.mjs" > "$APP_LOG" 2>&1 &
  printf "%s" "$!" > "$PID_DIR/app.pid"
}

install_launchd_app_service() {
  require_command node || fail "Node.js is required before installing the launchd service."
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

  local node_path path_value frontend_dist
  node_path="$(command -v node)"
  path_value="${PATH:-/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
  frontend_dist="$ROOT_DIR/FrontEnd/dist"

  cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$(xml_escape "$LAUNCHD_LABEL")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$node_path")</string>
    <string>$(xml_escape "$ROOT_DIR/scripts/prod-supervisor.mjs")</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$ROOT_DIR")</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>8080</string>
    <key>FRONTEND_DIST_DIR</key>
    <string>$(xml_escape "$frontend_dist")</string>
    <key>PATH</key>
    <string>$(xml_escape "$path_value")</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$APP_LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$APP_LOG")</string>
</dict>
</plist>
EOF

  stop_pid_file "$PID_DIR/app.pid"
  stop_launchd_app_service >/dev/null 2>&1 || true
  if launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST" >/dev/null 2>&1; then
    launchctl enable "gui/$(id -u)/$LAUNCHD_LABEL" >/dev/null 2>&1 || true
    launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL" >/dev/null 2>&1 || true
  else
    launchctl load -w "$LAUNCHD_PLIST" >/dev/null 2>&1 || fail "Could not load launchd service at $LAUNCHD_PLIST"
  fi
  info "Installed launchd service $LAUNCHD_LABEL"
}

stop_launchd_app_service() {
  if [[ ! -f "$LAUNCHD_PLIST" ]]; then return 0; fi
  launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST" >/dev/null 2>&1 || launchctl unload "$LAUNCHD_PLIST" >/dev/null 2>&1 || true
}

remove_launchd_app_service() {
  stop_launchd_app_service
  rm -f "$LAUNCHD_PLIST"
}

launchd_app_status() {
  if [[ ! -f "$LAUNCHD_PLIST" ]]; then
    printf "%-24s not installed\n" "Launchd service"
    return
  fi
  if launchctl print "gui/$(id -u)/$LAUNCHD_LABEL" >/dev/null 2>&1; then
    printf "%-24s loaded (%s)\n" "Launchd service" "$LAUNCHD_LABEL"
  else
    printf "%-24s installed but not loaded\n" "Launchd service"
  fi
}

wait_for_app() {
  info "Waiting for local production app"
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:8080/api/health" >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:8080" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  fail "Production app did not become ready. Check $APP_LOG"
}
