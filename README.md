# AutoResumeBuilder Web

Web implementation of the macOS Resume Builder workflow.

## Structure

- `Backend`: Node.js, Express, TypeScript, Prisma, SQLite by default.
- `FrontEnd`: React, Vite, TypeScript, custom CSS matching the macOS split-view/card UX.
- This web edition intentionally excludes Gmail and Automation. It is focused on profiles, resume generation, history/statistics, settings, and developer diagnostics.

## Implemented

- Profiles CRUD.
- Profile prompt, education, contact information, and DOCX styling controls.
- Dashboard resume generation queue.
- Two-call OpenAI workflow: profile base prompt first, full JD second.
- Duplicate job description guard with fuzzy 90%+ matching.
- Production-readiness verification for generated experience bullets.
- History, statistics, developer event log, API traces, and diagnostics export.
- Settings modal with global default OpenAI model, reasoning, API key, and duplicate guard controls.
- Profile-level OpenAI overrides for admins, with profile model/reasoning/API key falling back to global Settings when not specified.
- Dashboard visibility for rough input-token estimate and the effective model/reasoning used by each generation.
- Developer API traces include response usage metadata when OpenAI returns it.
- Cookie-based authentication with admin/normal-user authorization.
- Admin user management for adding, editing, deactivating, and removing users.
- Admin profile assignment for normal users. Assigned users only see their allowed profiles on the Dashboard and related generation/history views.
- Self-service account password updates for signed-in users.
- Downloadable generated DOCX artifacts.

## Local Development

Install everything once:

```bash
cd Web
npm run install:all
npm run db:init
```

Run both frontend and backend with automatic restart if either process exits:

```bash
cd Web
npm run dev
```

Backend only:

```bash
cd Web/Backend
cp .env.example .env
npm install
npm run db:init
npm run dev
```

Frontend only:

```bash
cd Web/FrontEnd
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

On the first backend startup, the app bootstraps one admin account if no users exist:

```text
Email: admin@example.com
Password: ChangeMe123!
```

Change this password after signing in, or set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` before first startup. Admins can manage profiles, API keys/settings, and users. Normal users can access Dashboard, resume generation, History, Statistics, and Developer diagnostics only.

## Reliable Local Uptime

Use `npm run dev` from the `Web` directory instead of running two terminals manually. The supervisor starts both services, restarts either service if it exits, and runs lightweight health checks against:

- Backend: `http://localhost:8080/api/health`
- Frontend: `http://localhost:5173`

Stop both with `Ctrl+C` in the supervisor terminal.

## Production MacBook Deployment Without Port Forwarding

Use this when the app must run on a MacBook behind a router and you cannot configure port forwarding. The production script builds the React app, serves it from the Express backend, and exposes the single local app through Cloudflare Tunnel. This is simpler and more reliable than keeping separate frontend/backend dev servers running in production.

From the `Web` folder, run:

```bash
npm run prod:deploy:mac
```

### Stable URL Setup

By default, Cloudflare quick tunnels create a temporary `trycloudflare.com` URL that changes after restarts. To keep the same URL every time, configure a named Cloudflare Tunnel with a hostname on a domain managed by Cloudflare:

```bash
npm run prod:setup-url
npm run prod:deploy:mac
```

The setup command saves local deployment settings in `.deploy/production.env`, creates or reuses a named tunnel, and routes your hostname to the MacBook. After this, every deployment reuses the same URL, for example:

```text
https://resume.yourdomain.com
```

If you already created a Cloudflare tunnel in the Cloudflare dashboard, you can also use a token instead:

```bash
mkdir -p .deploy
cat > .deploy/production.env <<'EOF'
AUTORB_PUBLIC_URL=https://resume.yourdomain.com
AUTORB_CLOUDFLARE_TUNNEL_TOKEN=your-cloudflare-tunnel-token
EOF
npm run prod:deploy:mac
```

If this was copied to a remote MacBook as a zip, the easiest option is to double-click:

```text
START-HERE-DEPLOY-MAC.command
```

The script will:

- Install Homebrew dependencies if needed.
- Install Node.js and Cloudflare Tunnel if missing.
- Create local `.env` files from examples when needed.
- Force production-safe defaults for local serving: `NODE_ENV=production`, built frontend served from the backend, and frontend API calls through `/api`.
- Install frontend/backend npm dependencies from lockfiles.
- Initialize the SQLite database.
- Build the backend and frontend.
- Install a macOS `launchd` service for the production backend supervisor. The backend serves both `/api` and the React app.
- Keep the backend alive through two layers of recovery: the Node supervisor restarts crashed backend workers, and macOS restarts the supervisor after crashes, sign-in, or reboot.
- Start a Cloudflare Tunnel in the background.
- Reuse your stable hostname when `.deploy/production.env` is configured, otherwise print a temporary `https://*.trycloudflare.com` URL.
- Start a GitHub auto-updater if the folder is a Git checkout with an `origin` remote.

Check deployment status:

```bash
npm run prod:status
```

Manually pull the latest GitHub push and restart production:

```bash
npm run prod:update
```

Restart only the production app service:

```bash
npm run prod:restart
```

Stop the deployment:

```bash
npm run prod:stop
```

View logs:

```bash
tail -f .deploy/logs/production-app.log .deploy/logs/cloudflared.log .deploy/logs/git-updater.log
```

Keep the MacBook awake and connected to the internet. The quick `trycloudflare.com` URL is excellent for testing, but it can change after tunnel restarts. For a stable production URL, run `npm run prod:setup-url` once and use your own Cloudflare-managed hostname.

### Recommended GitHub-Based Production Flow

On the production MacBook:

```bash
git clone <your-github-repo-url> AutoResumeBuilder-Web
cd AutoResumeBuilder-Web/Web
npm run prod:deploy:mac
```

After that, normal updates are:

```bash
git add .
git commit -m "Your update"
git push
```

The production MacBook auto-updater checks GitHub every 60 seconds by default. You can change that interval before deploying:

```bash
AUTO_UPDATE_INTERVAL_SECONDS=300 npm run prod:deploy:mac
```

If you do not want automatic updates, stop just the updater:

```bash
kill "$(cat .deploy/pids/git-updater.pid)"
rm .deploy/pids/git-updater.pid
```

### Permanent URL Option

For a permanent URL like `https://resume.yourdomain.com`, create a named Cloudflare Tunnel instead of relying on the temporary quick tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create autoresume-builder
cloudflared tunnel route dns autoresume-builder resume.yourdomain.com
cloudflared tunnel run --url http://127.0.0.1:8080 autoresume-builder
```

Then keep the production app running with:

```bash
npm run prod:deploy:mac
```

In this mode, the stable domain points to the MacBook through Cloudflare, with no router changes.

## VPS Deployment

The recommended production path is Docker Compose behind a reverse proxy such as Nginx or Caddy. Docker keeps the backend and frontend isolated, restarts services automatically, and gives you a simple upgrade path.

### 1. Prepare The Server

Use an Ubuntu LTS VPS with at least 2 GB RAM. Install Docker, the Compose plugin, and Git:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

Clone the project and enter the web app:

```bash
git clone <your-repo-url> autoresumebuilder
cd autoresumebuilder/Web
```

### 2. Configure Environment

Create the backend production env file:

```bash
cp Backend/.env.example Backend/.env
nano Backend/.env
```

Minimum production values:

```env
NODE_ENV=production
PORT=8080
WEB_ORIGIN=https://your-domain.com
DATABASE_URL=file:/app/data/prod.db
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=high
DEFAULT_ADMIN_EMAIL=admin@your-domain.com
DEFAULT_ADMIN_PASSWORD=replace-with-a-long-temporary-password
SESSION_TTL_DAYS=7
SESSION_COOKIE_DOMAIN=your-domain.com
```

Use a strong temporary default admin password before first startup. After the first login, change it from the Account modal.

### 3. Run With Docker Compose

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Both services use `restart: unless-stopped` and health checks:

```bash
docker compose restart backend
docker compose restart frontend
```

The frontend container listens on host port `5173`, and the backend listens on host port `8080`. For production, put TLS in front of the frontend and keep backend access limited to the server or private network where possible.

### 4. Add HTTPS Reverse Proxy

Example Nginx server block:

```nginx
server {
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

Install certificates with Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 5. Upgrade Safely

```bash
git pull
docker compose up -d --build
docker compose logs -f backend
```

Before major upgrades, back up the SQLite database and generated exports:

```bash
tar -czf autoresumebuilder-backup-$(date +%Y%m%d).tar.gz Backend/data
```

### Non-Docker Alternative

Use PM2 for the backend and Nginx for the built frontend:

```bash
cd Web/Backend
npm ci
npm run db:init
npm run build
pm2 start dist/server.js --name autoresumebuilder-api

cd ../FrontEnd
npm ci
npm run build
```

Serve `Web/FrontEnd/dist` with Nginx and proxy `/api` to the backend port.

Docker Compose is still preferred for this project because it keeps local and VPS behavior closer together.

## Environment

Backend can use `OPENAI_API_KEY`, or you can add the key in the web Settings modal. The Settings key takes precedence when configured.
For production, set `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`, `SESSION_TTL_DAYS`, and a locked-down `WEB_ORIGIN` before the first launch. If you are serving the API behind a dedicated host or subdomain, also set `SESSION_COOKIE_DOMAIN` so the session cookie is scoped exactly where you want it.
