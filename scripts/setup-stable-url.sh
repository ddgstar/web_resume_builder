#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

install_system_dependencies

printf "\nStable AutoResumeBuilder URL Setup\n"
printf "==================================\n\n"
printf "Temporary trycloudflare.com URLs change every time. A stable URL requires a Cloudflare account and a domain on Cloudflare.\n\n"

read -r -p "Stable hostname, e.g. resume.yourdomain.com: " hostname
hostname="${hostname//[[:space:]]/}"
if [[ -z "$hostname" || "$hostname" != *.* ]]; then
  fail "Please enter a valid hostname like resume.yourdomain.com"
fi

default_tunnel_name="${AUTORB_TUNNEL_NAME:-autoresume-builder}"
read -r -p "Tunnel name [$default_tunnel_name]: " tunnel_name
tunnel_name="${tunnel_name:-$default_tunnel_name}"
tunnel_name="${tunnel_name//[[:space:]]/-}"

mkdir -p "$(dirname "$DEPLOY_ENV_FILE")"
cat > "$DEPLOY_ENV_FILE" <<EOF
# AutoResumeBuilder production deployment settings.
# This file is intentionally local and should not be committed.
AUTORB_PUBLIC_HOSTNAME=$hostname
AUTORB_PUBLIC_URL=https://$hostname
AUTORB_TUNNEL_NAME=$tunnel_name
EOF

printf "\nSaved stable URL settings to %s\n" "$DEPLOY_ENV_FILE"
printf "Public URL will be: https://%s\n\n" "$hostname"

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  printf "Cloudflare login is required once. A browser window will open now.\n"
  cloudflared tunnel login
fi

if ! cloudflared tunnel info "$tunnel_name" >/dev/null 2>&1; then
  info "Creating Cloudflare named tunnel: $tunnel_name"
  cloudflared tunnel create "$tunnel_name"
fi

info "Routing $hostname to tunnel $tunnel_name"
cloudflared tunnel route dns "$tunnel_name" "$hostname" >/dev/null 2>&1 || warn "DNS route may already exist. Continuing."

cat <<EOF

Stable URL setup complete.

Next command:
  npm run prod:deploy:mac

After deployment, use:
  https://$hostname

EOF
