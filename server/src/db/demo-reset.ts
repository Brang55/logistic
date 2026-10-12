import "dotenv/config";
import { inArray, sql } from "drizzle-orm";
import { createDb } from "./client";
import { users } from "./schema";
import { seed } from "./seed";

// Driver-app logins of the European demo drivers, from before the demo became US-only.
const RETIRED_DEMO_LOGINS = ["g.petrov@demo.logistic", "a.mueller@demo.logistic", "j.devries@demo.logistic", "m.rossi@demo.logistic"];

/**
 * Puts the demo back to its starting state: removes all cargo, trucks, trailers, drivers,
 * positions, road reports and driver chat, then re-seeds them. Logins (including the owner
 * account) are kept, apart from retired demo driver logins.
 * Run with `npm run demo:reset -- --yes`; restart the API afterwards so the simulator
 * and traffic monitor start from the fresh data.
 */
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all cargo, trucks, trailers, drivers, positions, road reports and driver chat. Re-run with --yes to continue.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_RESET !== "true") {
    console.error("Refusing to reset a production database (set ALLOW_DEMO_RESET=true for a demo server).");
    process.exit(1);
  }

  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await db.execute(sql`TRUNCATE cargos, positions, drivers, trucks, trailers, road_reports, chat_messages CASCADE`);
  await db.delete(users).where(inArray(users.email, RETIRED_DEMO_LOGINS));
  await seed(db);
  await pool.end();
  console.log("Demo data reset.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
