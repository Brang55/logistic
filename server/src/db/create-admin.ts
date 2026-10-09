import "dotenv/config";
import * as argon2 from "argon2";
import { createDb, Database } from "./client";
import { users } from "./schema";

/** Creates the OWNER_EMAIL / OWNER_PASSWORD admin login once; an existing account is left untouched. */
export async function ensureOwner(db: Database) {
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !process.env.OWNER_PASSWORD) return;
  const [owner] = await db
    .insert(users)
    .values({ email, passwordHash: await argon2.hash(process.env.OWNER_PASSWORD), role: "admin" })
    .onConflictDoNothing()
    .returning({ email: users.email });
  console.log(owner ? `Created admin account ${owner.email}` : `Admin account ${email} already exists`);
}

// Production: `node dist/db/create-admin.js` creates only the owner account, no demo data.
if (require.main === module) {
  if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD) {
    console.error("Set OWNER_EMAIL and OWNER_PASSWORD first.");
    process.exit(1);
  }
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  ensureOwner(db)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
