/**
 * Local-only maintenance script. Never expose as a web endpoint.
 *
 * Usage:
 *   npx tsx scripts/seed-and-reset.ts create-user <username> <password>
 *   npx tsx scripts/seed-and-reset.ts clear-cooldown <username>
 *   npx tsx scripts/seed-and-reset.ts end-session <username>
 *   npx tsx scripts/seed-and-reset.ts expire-session <username>
 *   npx tsx scripts/seed-and-reset.ts set-solved <username>
 */

import { config as loadEnv } from "dotenv";
import { hash } from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import * as schema from "../lib/db/schema";
import { levelFromKey } from "../lib/game/level-config";
import { parseSaveState, requiredPuzzleIds } from "../lib/game/save-schema";

loadEnv({ path: ".env.local" });

neonConfig.webSocketConstructor = ws;

function getPool() {
  const connectionString =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Set DATABASE_URL_DIRECT or DATABASE_URL in .env.local for local scripts.",
    );
  }
  return new Pool({ connectionString, max: 5 });
}

async function findUserByUsername(
  db: ReturnType<typeof drizzle<typeof schema>>,
  username: string,
) {
  const normalized = username.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, normalized))
    .limit(1);
  return user;
}

async function createUser(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 24) {
    throw new Error("Username must be 3–24 characters.");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const pool = getPool();
  const db = drizzle(pool, { schema });

  try {
    const passwordHash = await hash(password, 12);
    const [created] = await db
      .insert(schema.users)
      .values({ username: normalized, passwordHash })
      .returning({ id: schema.users.id, username: schema.users.username });
    console.log("Created user:", created);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "23505") {
      throw new Error(`Username "${normalized}" is already taken.`);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

async function clearCooldown(username: string) {
  const pool = getPool();
  const db = drizzle(pool, { schema });

  try {
    const user = await findUserByUsername(db, username);
    if (!user) {
      throw new Error(`User not found: ${username}`);
    }
    await db
      .update(schema.users)
      .set({ cooldownUntil: null, cooldownReason: null })
      .where(eq(schema.users.id, user.id));
    console.log(`Cleared cooldown for "${user.username}".`);
  } finally {
    await pool.end();
  }
}

async function endSession(username: string) {
  const pool = getPool();
  const db = drizzle(pool, { schema });

  try {
    const user = await findUserByUsername(db, username);
    if (!user) {
      throw new Error(`User not found: ${username}`);
    }

    const [active] = await db
      .select()
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.userId, user.id),
          eq(schema.gameSessions.status, "active"),
        ),
      )
      .limit(1);

    if (!active) {
      console.log(`No active session for "${user.username}".`);
      return;
    }

    await db
      .update(schema.gameSessions)
      .set({
        status: "abandoned",
        endedAt: sql`now()`,
      })
      .where(eq(schema.gameSessions.id, active.id));

    console.log(`Ended active session for "${user.username}".`);
  } finally {
    await pool.end();
  }
}

async function expireSession(username: string) {
  const pool = getPool();
  const db = drizzle(pool, { schema });

  try {
    const user = await findUserByUsername(db, username);
    if (!user) {
      throw new Error(`User not found: ${username}`);
    }

    const [active] = await db
      .select()
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.userId, user.id),
          eq(schema.gameSessions.status, "active"),
        ),
      )
      .limit(1);

    if (!active) {
      throw new Error(`No active session for "${user.username}".`);
    }

    await db
      .update(schema.gameSessions)
      .set({
        expiresAt: sql`now() - interval '1 second'`,
      })
      .where(eq(schema.gameSessions.id, active.id));

    console.log(`Moved expires_at into the past for "${user.username}".`);
  } finally {
    await pool.end();
  }
}

async function setSolved(username: string) {
  const pool = getPool();
  const db = drizzle(pool, { schema });

  try {
    const user = await findUserByUsername(db, username);
    if (!user) {
      throw new Error(`User not found: ${username}`);
    }

    const [active] = await db
      .select()
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.userId, user.id),
          eq(schema.gameSessions.status, "active"),
        ),
      )
      .limit(1);

    if (!active) {
      throw new Error(`No active session for "${user.username}".`);
    }

    const level = levelFromKey(active.durationKey);
    if (!level) {
      throw new Error("Unknown duration key on session.");
    }

    const [save] = await db
      .select()
      .from(schema.saveStates)
      .where(eq(schema.saveStates.sessionId, active.id))
      .limit(1);

    if (!save) {
      throw new Error("No save state for the active session.");
    }

    const parsed = parseSaveState(save.stateJson);
    const next = parsed
      ? { ...parsed, solvedPuzzles: requiredPuzzleIds(level) }
      : {
          schemaVersion: "1.0" as const,
          sessionId: active.id,
          duration: Math.round(active.durationSeconds / 60),
          authoritativeExpiry: active.expiresAt,
          currentStage: 1,
          inventory: [] as string[],
          inspectedObjects: [] as string[],
          solvedPuzzles: requiredPuzzleIds(level),
          hintCount: 0,
        };

    await db
      .update(schema.saveStates)
      .set({
        stateJson: next,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.saveStates.sessionId, active.id));

    console.log(`Marked required puzzles solved for "${user.username}".`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case "create-user": {
      const [username, password] = args;
      if (!username || !password) {
        throw new Error(
          "Usage: create-user <username> <password>",
        );
      }
      await createUser(username, password);
      break;
    }
    case "clear-cooldown": {
      const [username] = args;
      if (!username) {
        throw new Error("Usage: clear-cooldown <username>");
      }
      await clearCooldown(username);
      break;
    }
    case "end-session": {
      const [username] = args;
      if (!username) {
        throw new Error("Usage: end-session <username>");
      }
      await endSession(username);
      break;
    }
    case "expire-session": {
      const [username] = args;
      if (!username) {
        throw new Error("Usage: expire-session <username>");
      }
      await expireSession(username);
      break;
    }
    case "set-solved": {
      const [username] = args;
      if (!username) {
        throw new Error("Usage: set-solved <username>");
      }
      await setSolved(username);
      break;
    }
    default:
      throw new Error(
        "Unknown command. Use: create-user | clear-cooldown | end-session | expire-session | set-solved",
      );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
