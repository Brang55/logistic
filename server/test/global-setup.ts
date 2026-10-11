import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { createDb } from "../src/db/client";
import { TEST_DATABASE_URL } from "./test-env";

// Creates the test database if needed and migrates it. Each e2e file empties the tables itself.
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const { db, pool } = createDb(TEST_DATABASE_URL);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
}
