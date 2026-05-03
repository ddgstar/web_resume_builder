#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

stop_pid_file "$PID_DIR/app.pid"
stop_pid_file "$PID_DIR/cloudflared.pid"
stop_pid_file "$PID_DIR/git-updater.pid"

printf "Stopped AutoResumeBuilder production deployment.\n"
