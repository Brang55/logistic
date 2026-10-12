import { createDb } from "../../src/db/client";
import { TEST_DATABASE_URL } from "../test-env";

// PostGIS keeps its reference table in "public"; drizzle's migrations live in their own schema.
const KEEP = ["spatial_ref_sys"];

/** Empties every application table so each e2e file starts from a clean database. */
export async function truncateAll() {
  const { pool } = createDb(TEST_DATABASE_URL);
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL($1)",
      [KEEP],
    );
    if (rows.length) {
      await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}
