import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url });
  return { pool, db: drizzle(pool, { schema }) };
}
