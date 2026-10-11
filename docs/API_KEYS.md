# API keys and accounts

Which external keys the app uses, which are still missing, and how to add each one.
Keys never go into git: `.env`, `server/.env` and `.env.production` are all gitignored.

| Key | Where | Status | Used for |
| --- | --- | --- | --- |
| `TOMTOM_API_KEY` | `server/.env` | **Missing** | Truck routing (height, width, length, weight, axles), traffic on routes, truck drive times for next-pickup suggestions |
| `MAPBOX_SECRET_TOKEN` | `server/.env` | **Missing** | Address lookup (US only); routing and drive times when TomTom is missing or refuses |
| `VITE_MAPBOX_ACCESS_TOKEN` | `.env` | Set | Map tiles and address autocomplete in the browser |
| `ANTHROPIC_API_KEY` | `server/.env` | Missing (optional) | Voice commands in any language. Without it, a built-in English parser is used |
| `TELEMATICS_WEBHOOK_SECRET` | `server/.env` | Set | Shared secret a telematics provider sends with each GPS position |

Restart the API after changing `server/.env` (`npm run start:dev` restarts on its own; for `node dist/main.js` stop and start it again).
Restart Vite after changing `.env`.

## 1. TomTom API key (`TOMTOM_API_KEY`), required for truck routing

Routes, ETAs, traffic incidents and restriction warnings come from TomTom's truck routing. Without the key the app
falls back to Mapbox's car profile, which only knows height, width and weight.

1. Sign up at <https://developer.tomtom.com> and open **Dashboard** → **Keys**. A key named "My first API key" is created for you; you can use it or create one named `logistic-server`.
2. Make sure the key has the **Routing API** and **Matrix Routing v2 API** products enabled.
3. Put it in `server/.env`:
   ```sh
   TOMTOM_API_KEY=<the key>
   ```
4. Restart the API. Its log says `Routing with TomTom (truck)`. Check it: open Dispatch, pick a load and a truck.
   A route should appear, and the box truck (US-210) and an 80,000 lb rig (US-201) can get different routes.

The free tier includes a monthly allowance (Matrix Routing has a much smaller one than Routing). When TomTom refuses
the matrix because the allowance is used up, next-pickup suggestions use Mapbox car times until it's available again.
Add prepaid credit in the TomTom dashboard to keep truck drive times.

## 2. Mapbox secret token (`MAPBOX_SECRET_TOKEN`), required

During local development the API was started with the browser token passed in on the command line, so routing worked.
A server needs its own token, without URL restrictions, kept only on the server.

1. Sign in at <https://account.mapbox.com> and open **Tokens** → **Create a token**.
2. Name it `logistic-server`.
3. Keep the default public scopes. No secret scopes are needed: Directions, Matrix, Geocoding and Optimization only need public scopes.
4. Leave **URL restrictions empty**. Server requests send no browser `Referer` header, so a URL-restricted token would be refused.
5. Create the token and copy it. Mapbox shows `sk.` tokens only once; a `pk.` token without URL restrictions works too.
6. Put it in `server/.env`:
   ```sh
   MAPBOX_SECRET_TOKEN=<the token>
   ```
7. Restart the API. Check it: add a load with a US pickup and delivery address; both should appear on the Dispatch map.
   If the API log says "MAPBOX_SECRET_TOKEN is not configured", it didn't pick up the file.

## 3. Mapbox browser token (`VITE_MAPBOX_ACCESS_TOKEN`), set

Already set in `.env`. Before going live, lock it to your domain, because it's visible to anyone using the site:

1. In <https://account.mapbox.com> → **Tokens**, edit the token.
2. Under **URL restrictions**, add `https://your-domain.com` (and `http://localhost:5173` if you still develop with the same token; better to use a separate dev token).
3. Save. Nothing in the app needs to change.

## 4. Mapbox account settings (not keys)

- **Billing / payment method**: the app saves looked-up addresses on each cargo, which Mapbox's terms only allow with
  *permanent* geocoding (`permanent=true`). Permanent geocoding is billed from the first request, so add a payment
  method under **Account → Billing**. Without one, address lookups may be refused.
- **Optimization API v2 (beta)**: needed later for planning many trucks and stops at once. Request access through
  Mapbox (contact sales or the beta form linked from the Optimization v2 docs). Today the app uses Directions + Matrix and doesn't need it.

## 5. Anthropic API key (`ANTHROPIC_API_KEY`), optional

Lets drivers give voice commands in Spanish and other languages. Without it, a built-in English command parser handles them.

1. Sign in at <https://console.anthropic.com>. Under **Settings → Billing**, add credit.
2. Open **API keys** → **Create key**. Name it `logistic-voice` and copy the key (`sk-ant-...`).
3. Put it in `server/.env`:
   ```sh
   ANTHROPIC_API_KEY=<the key>
   # Optional; defaults to claude-opus-5-5. A smaller model is cheaper, e.g. claude-haiku-5-5
   VOICE_MODEL=
   ```
4. Restart the API. Check it: log in as a driver, tap the microphone and say a command in another language, such as
   "Voy 20 minutos tarde por el tráfico" ("I'm 20 minutes late because of traffic").

## 6. Telematics webhook secret (`TELEMATICS_WEBHOOK_SECRET`), set

Already generated. When you connect a real telematics provider, configure it to POST positions to
`https://your-domain.com/api/telematics/webhook` with the header `x-telematics-secret: <the secret>`.
In `server/.env`, set `TELEMATICS_PROVIDER=` (empty) so the simulator stops moving the trucks.
To rotate the secret: `openssl rand -hex 24`, then update both the provider and `server/.env`.

## 7. Future integrations (need commercial agreements first)

These aren't keys you can generate yourself. Each one needs a contract with the provider, and then an adapter behind
the existing interfaces in the server. The app already works without them; mock data stands in.

| Integration | Providers | Where it plugs in |
| --- | --- | --- |
| Load boards | DAT, Truckstop | `server/src/loadboards/` (`LoadBoardProvider`) |
| Truck telematics | Samsara, Geotab, Motive, Webfleet | `server/src/telematics/` (webhook or a polling provider) |

## Production

On the server, all of these go in `.env.production` (template: `.env.production.example`). See [DEPLOY.md](DEPLOY.md).
Apply changes with `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`.
The `--build` matters for `VITE_MAPBOX_ACCESS_TOKEN`, which is built into the web bundle.
