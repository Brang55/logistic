import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { seed } from "./seed";

/**
 * Puts the demo back to its starting state: removes all cargo, trucks, trailers, drivers
 * and positions, then re-seeds them. Logins (including the owner account) are kept.
 * Run with `npm run demo:reset -- --yes`; restart the API afterwards so the simulator
 * and traffic monitor start from the fresh data.
 */
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all cargo, trucks, trailers, drivers and positions. Re-run with --yes to continue.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_RESET !== "true") {
    console.error("Refusing to reset a production database (set ALLOW_DEMO_RESET=true for a demo server).");
    process.exit(1);
  }

  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql`TRUNCATE cargos, positions, drivers, trucks, trailers CASCADE`);
  await seed(db);
  await pool.end();
  console.log("Demo data reset.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
