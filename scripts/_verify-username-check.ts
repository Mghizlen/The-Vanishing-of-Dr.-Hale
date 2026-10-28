import { config } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local" });
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL_DIRECT;
if (!connectionString) {
  throw new Error("DATABASE_URL_DIRECT is not set");
}

const pool = new Pool({ connectionString, max: 1 });

async function main() {
  const result = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conname = 'users_username_lowercase'`,
  );
  if (result.rowCount !== 1) {
    throw new Error(`Expected 1 constraint, found ${result.rowCount}`);
  }
  console.log(result.rows[0].conname, result.rows[0].def);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    void pool.end();
    process.exit(1);
  });
