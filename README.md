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

Demo logins (from the seed): `admin@demo.logistic` and `dispatcher@demo.logistic`, password `demo12345`
(override with `SEED_PASSWORD`). Accounts are created by an admin via `POST /api/auth/register`.

Routing and geocoding run on the server with `MAPBOX_SECRET_TOKEN` (an `sk.` token); the web app only uses
the public `VITE_MAPBOX_ACCESS_TOKEN` in the root `.env` for map tiles. Cargo addresses are geocoded with Mapbox
permanent geocoding, because the coordinates are stored, and that requires a payment method on the Mapbox account.

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
