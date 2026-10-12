# Logistic

Web app (React + Vite, repo root) with a NestJS + PostgreSQL/PostGIS API in `server/`.

- Deploying to a server: [docs/DEPLOY.md](docs/DEPLOY.md)
- API keys still to add, and how: [docs/API_KEYS.md](docs/API_KEYS.md)
- Client demo script: [docs/DEMO.md](docs/DEMO.md) (reset with `cd server && npm run demo:reset -- --yes`)

## Local development

```sh
docker compose up -d db redis       # Postgres/PostGIS on :5432, Redis on :6379
cd server
cp .env.example .env                # set JWT_ACCESS_SECRET (openssl rand -hex 32), MAPBOX_SECRET_TOKEN and TOMTOM_API_KEY
npm install
npm run db:migrate
npm run db:seed                     # US demo trucks, drivers, trailers and cargo
npm run start:dev                   # API on :3000, Swagger UI at http://localhost:3000/docs
cd ..
npm install
npm run dev                         # web on :5173, /api is proxied to :3000
```

Owner login: set `OWNER_EMAIL` / `OWNER_PASSWORD` in `server/.env` and run `npm run db:seed`; it creates that
admin account once (an existing account's password is never changed).

Demo logins (from the seed), password `demo12345` (override with `SEED_PASSWORD`):
`admin@demo.logistic`, `dispatcher@demo.logistic`, and the driver app login `j.carter@demo.logistic`.
Staff accounts are created by an admin via `POST /api/auth/register`; driver app logins from the
Drivers page ("Create app login").

Truck routing runs on the server with TomTom (`TOMTOM_API_KEY`, `travelMode=truck`): routes respect each truck's
height, width, length, weight and axles, and carry live traffic. Without a TomTom key (or with `ROUTING_PROVIDER=mapbox`)
routing falls back to Mapbox's car profile with height/width/weight limits only. Geocoding runs on the server with
`MAPBOX_SECRET_TOKEN` (an `sk.` token), limited to US addresses; the web app only uses the public
`VITE_MAPBOX_ACCESS_TOKEN` in the root `.env` for map tiles. Cargo addresses are geocoded with Mapbox permanent
geocoding, because the coordinates are stored, and that requires a payment method on the Mapbox account.

The fleet is US-only for now. The API and database are metric; the web app shows miles, mph, pounds and feet
(`src/utils/units.ts`).

## Truck positions (telematics)

Positions are stored in `positions` and pushed live to dispatchers over Socket.IO (namespace `/live`,
authenticated with the access token). Two ways to feed them:

- **Simulator** (`TELEMATICS_PROVIDER=simulator`): every truck assigned to a cargo drives from its last position
  to the pickup and on to the delivery along its real truck route, `SIMULATOR_SPEEDUP` times faster than real time.
- **Webhook** for telematics providers, matched by `trucks.telematicsId` or truck number:

  ```sh
  curl -X POST localhost:3000/api/telematics/webhook \
    -H "x-telematics-secret: $TELEMATICS_WEBHOOK_SECRET" -H "content-type: application/json" \
    -d '{"positions":[{"vehicleId":"US-201","lng":-96.8,"lat":32.78,"speedKmh":105,"heading":10}]}'
  ```

With `REDIS_URL` set, live updates are shared across API instances. Some state still lives in each API
process: the recent alerts list, the latest traffic report, cached trip routes, the simulator and the
background monitors. Run a single API instance until those move to the database or Redis.

## Trips, traffic and the driver app

- A truck can have several loads queued; it works them in order (the picked-up one first, then by pickup
  date) and stays "taken" until the last one is delivered.
- **Live Fleet → truck → Suggested next pickups** ranks unassigned loads within `NEXT_PICKUP_MAX_KM`
  by truck drive time (TomTom Matrix, live traffic) from where the truck will be free. If TomTom refuses
  (quota, key, outage), Mapbox car times are used instead so suggestions keep working.
- **Traffic** checks every active trip against live traffic every `TRAFFIC_MONITOR_INTERVAL_MS`
  (default 5 min, `0` disables) and raises alerts for growing delays, closures and major incidents.
  Alerts are kept in memory (last 100).
- **Driver app** (`/driver`, driver role): next stop with ETA and contact, confirm pickup/delivery,
  report delays, route map and directions. The simulator marks loads picked up/delivered on arrival
  unless `SIMULATOR_AUTO_STATUS=false`.

Tests: `npm test` for the web app (Vitest), and `cd server && npm test` (unit) and `npm run test:e2e` (uses a separate `logistic_test` database in the same container).

Schema changes: edit `server/src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
}
```

- Replace `plugin:@typescript-eslint/recommended` to `plugin:@typescript-eslint/recommended-type-checked` or `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends` list

## Assistant and load boards

- **Assistant** (`server/src/assistant`): type or speak (mic in Chrome, Edge, Safari). Staff open it with ⌘K;
  drivers have it on their trip page. Claude (`ASSISTANT_MODEL`, default `claude-opus-5-5`) answers with
  lookups and proposes changes as cards; a change runs only when the user taps Confirm. Drivers can ask about
  their trip and road reports, report delays and road problems, confirm pickup/delivery, change an address,
  message dispatch or the drivers' chat, and add logbook entries. Without `ANTHROPIC_API_KEY` (or if the
  Claude call fails), drivers get a built-in English keyword parser for the common commands.
- **Load Board** (staff): search the boards, see the nearest free truck per load, and import a load as cargo
  (importing twice returns the same cargo). Loads your company booked on a board are imported automatically
  every `LOADBOARD_SYNC_INTERVAL_MS`. The board is a mock US exchange behind a `LoadBoardProvider`
  interface; real adapters (DAT, Truckstop) need API access from those providers.

