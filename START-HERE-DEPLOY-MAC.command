#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

printf "\nAutoResumeBuilder Web Deployment\n"
printf "================================\n\n"
printf "This will deploy the production app on this Mac and expose it globally through Cloudflare Tunnel.\n"
printf "No router port forwarding is required.\n\n"

bash "$SCRIPT_DIR/scripts/deploy-production-mac.sh"

printf "\nIf this window closes, you can check status later by running:\n"
printf "  npm run prod:status\n\n"
