import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

const ATTEMPTS = 30;

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  // The database may still be starting when the API container boots.
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("select 1");
      break;
    } catch (err) {
      if (attempt === ATTEMPTS) throw err;
      console.log(`Waiting for the database (${attempt}/${ATTEMPTS})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
