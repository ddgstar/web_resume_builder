#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

info "Restarting AutoResumeBuilder production app"
start_production_app
wait_for_app
info "Production app restarted"
