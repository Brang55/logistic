# Deploying to a server

The production stack is four containers (`docker-compose.prod.yml`): PostGIS, Redis, the NestJS API and
Caddy, which serves the web app, proxies `/api` and the live socket, and gets HTTPS certificates
automatically.

## 1. Server

- A VPS with 2 vCPU / 4 GB RAM is enough for a pilot (Ubuntu 24.04 LTS or similar).
- Install Docker Engine with the compose plugin: <https://docs.docker.com/engine/install/ubuntu/>
- Open ports 80 and 443 (e.g. `ufw allow 80,443/tcp && ufw allow 443/udp`); keep SSH restricted.
- Point a DNS **A record** for your domain (e.g. `app.example.com`) at the server's IP.

## 2. Configure

```sh
git clone <your repo> /opt/logistic && cd /opt/logistic
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in `.env.production`:

| Variable | Value |
| --- | --- |
| `SITE_ADDRESS`, `PUBLIC_URL` | `app.example.com`, `https://app.example.com` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
| `VITE_MAPBOX_ACCESS_TOKEN` | public `pk.` token, URL-restricted to your domain in the Mapbox console |
| `MAPBOX_SECRET_TOKEN` | secret `sk.` token (geocoding; routing fallback) |
| `TOMTOM_API_KEY` | TomTom key for truck routing, traffic and the truck drive-time matrix |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | the first admin login |
| `TELEMATICS_PROVIDER` | `simulator` for a demo server, empty when real telematics post to the webhook |
| `TELEMATICS_WEBHOOK_SECRET` | `openssl rand -hex 24`; give it to the telematics provider |
| `ANTHROPIC_API_KEY` | optional, multilingual voice commands |

## 3. Start

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node dist/db/create-admin.js
```

The API applies database migrations on every start. Open `https://app.example.com` and log in with the
owner account. For a demo server, also load the demo data (and set `ALLOW_DEMO_RESET=true` if you want
to reset it between demos with `node dist/db/demo-reset.js --yes`):

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node dist/db/seed.js
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

## 4. Operate

- **Logs**: `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api`
- **Update**: `git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
- **Backups**: `./scripts/backup.sh` writes `backups/logistic-<date>.dump` and `backups/uploads-<date>.tgz`
  (document scans), keeping 14 of each. Add it to cron:
  `0 3 * * * cd /opt/logistic && ./scripts/backup.sh >> backups/backup.log 2>&1`, and copy `backups/` off
  the server (e.g. to object storage).
- **Restore**: `docker compose ... exec -T db pg_restore -U logistic -d logistic --clean < backups/<file>.dump`;
  document scans: `docker compose ... exec -T api tar -xz -C /app < backups/uploads-<date>.tgz`
- **Telematics webhook**: `https://app.example.com/api/telematics/webhook` with header
  `x-telematics-secret` (format in the README).

## Notes

- Voice input in the browser needs HTTPS, which Caddy provides once DNS points at the server.
- API docs (`/docs`) are off in production; set `SWAGGER=true` in `.env.production` to enable them.
- Login and token refresh are limited to `LOGIN_RATE_LIMIT` requests per minute per IP.
- Positions are kept forever for now; add a retention job before connecting a large fleet.
