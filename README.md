# Logistic

Web app (React + Vite, repo root) with a NestJS + PostgreSQL/PostGIS API in `server/`.

## Local development

```sh
docker compose up -d db redis       # Postgres/PostGIS on :5432, Redis on :6379
cd server
cp .env.example .env                # set JWT_ACCESS_SECRET (openssl rand -hex 32) and MAPBOX_SECRET_TOKEN
npm install
npm run db:migrate
npm run db:seed                     # demo trucks, drivers, trailers and US/EU cargo
npm run start:dev                   # API on :3000, Swagger UI at http://localhost:3000/docs
cd ..
npm install
npm run dev                         # web on :5173, /api is proxied to :3000
```

Demo logins (from the seed), password `demo12345` (override with `SEED_PASSWORD`):
`admin@demo.logistic`, `dispatcher@demo.logistic`, and the driver app login `g.petrov@demo.logistic`.
Staff accounts are created by an admin via `POST /api/auth/register`; driver app logins from the
Drivers page ("Create app login").

Routing and geocoding run on the server with `MAPBOX_SECRET_TOKEN` (an `sk.` token); the web app only uses
the public `VITE_MAPBOX_ACCESS_TOKEN` in the root `.env` for map tiles. Cargo addresses are geocoded with Mapbox
permanent geocoding, because the coordinates are stored, and that requires a payment method on the Mapbox account.

## Truck positions (telematics)

Positions are stored in `positions` and pushed live to dispatchers over Socket.IO (namespace `/live`,
authenticated with the access token). Two ways to feed them:

- **Simulator** (`TELEMATICS_PROVIDER=simulator`): every truck assigned to a cargo drives from its last position
  to the pickup and on to the delivery along its real truck route, `SIMULATOR_SPEEDUP` times faster than real time.
- **Webhook** for telematics providers, matched by `trucks.telematicsId` or truck number:

  ```sh
  curl -X POST localhost:3000/api/telematics/webhook \
    -H "x-telematics-secret: $TELEMATICS_WEBHOOK_SECRET" -H "content-type: application/json" \
    -d '{"positions":[{"vehicleId":"TR-101","lng":23.32,"lat":42.69,"speedKmh":72,"heading":310}]}'
  ```

With `REDIS_URL` set, live updates are shared across API instances.

## Trips, traffic and the driver app

- A truck can have several loads queued; it works them in order (the picked-up one first, then by pickup
  date) and stays "taken" until the last one is delivered.
- **Live Fleet → truck → Suggested next pickups** ranks unassigned loads within `NEXT_PICKUP_MAX_KM`
  by drive time (Mapbox Matrix, live traffic, car times) from where the truck will be free.
- **Traffic** checks every active trip against live traffic every `TRAFFIC_MONITOR_INTERVAL_MS`
  (default 5 min, `0` disables) and raises alerts for growing delays, closures and major incidents.
  Alerts are kept in memory (last 100).
- **Driver app** (`/driver`, driver role): next stop with ETA and contact, confirm pickup/delivery,
  report delays, route map and directions. The simulator marks loads picked up/delivered on arrival
  unless `SIMULATOR_AUTO_STATUS=false`.

Tests: `cd server && npm test` (unit) and `npm run test:e2e` (uses a separate `logistic_test` database in the same container).

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
