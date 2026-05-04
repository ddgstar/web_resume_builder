#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"

install_system_dependencies

printf "\nStable AutoResumeBuilder URL Setup\n"
printf "==================================\n\n"
cat <<EOF
Temporary trycloudflare.com URLs change every time.

For a URL that never changes, use a subdomain on a Cloudflare-managed domain,
for example:
  resume.yourdomain.com
  app.yourdomain.com
  builder.yourdomain.com

Recommended domain strategy:
  - Use an existing domain if you already own one.
  - Put the app on a subdomain like resume.example.com.
  - Do not use the root/apex domain unless this app is the whole website.

Choose setup mode:
  1) Cloudflare Dashboard token (recommended, easiest, most reliable)
  2) Local cloudflared named tunnel via CLI

EOF

read -r -p "Mode [1]: " mode
mode="${mode:-1}"

read -r -p "Stable hostname, e.g. resume.yourdomain.com: " hostname
hostname="${hostname//[[:space:]]/}"
if [[ -z "$hostname" || "$hostname" != *.* ]]; then
  fail "Please enter a valid hostname like resume.yourdomain.com"
fi

mkdir -p "$(dirname "$DEPLOY_ENV_FILE")"

if [[ "$mode" == "1" ]]; then
  cat <<EOF

Cloudflare Dashboard steps:
  1. Open Cloudflare Zero Trust dashboard.
  2. Go to Networks / Tunnels.
  3. Create a Cloudflared tunnel, or open your existing tunnel.
  4. Add Public Hostname:
       Hostname: $hostname
       Service:  http://localhost:8080
  5. Copy the tunnel token from the connector install command.

EOF
  read -r -s -p "Paste Cloudflare tunnel token: " tunnel_token
  printf "\n"
  if [[ -z "$tunnel_token" ]]; then
    fail "Tunnel token is required for dashboard-token mode."
  fi

  cat > "$DEPLOY_ENV_FILE" <<EOF
# AutoResumeBuilder production deployment settings.
# This file is intentionally local and should not be committed.
AUTORB_PUBLIC_URL=https://$hostname
AUTORB_CLOUDFLARE_TUNNEL_TOKEN=$tunnel_token
EOF
else
  default_tunnel_name="${AUTORB_TUNNEL_NAME:-autoresume-builder}"
  read -r -p "Tunnel name [$default_tunnel_name]: " tunnel_name
  tunnel_name="${tunnel_name:-$default_tunnel_name}"
  tunnel_name="${tunnel_name//[[:space:]]/-}"

  cat > "$DEPLOY_ENV_FILE" <<EOF
# AutoResumeBuilder production deployment settings.
# This file is intentionally local and should not be committed.
AUTORB_PUBLIC_HOSTNAME=$hostname
AUTORB_PUBLIC_URL=https://$hostname
AUTORB_TUNNEL_NAME=$tunnel_name
EOF

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
fi

cat <<EOF

Saved stable URL settings to:
  $DEPLOY_ENV_FILE

Stable URL setup complete.

Next command:
  npm run prod:deploy:mac

After deployment, use:
  https://$hostname

EOF
