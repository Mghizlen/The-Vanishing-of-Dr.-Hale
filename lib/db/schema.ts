import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    cooldownUntil: timestamp("cooldown_until", {
      withTimezone: true,
      mode: "string",
    }),
    cooldownReason: text("cooldown_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("users_username_unique").on(table.username)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    userAgentLabel: text("user_agent_label"),
  },
  (table) => [
    uniqueIndex("devices_user_id_token_hash_unique").on(
      table.userId,
      table.tokenHash,
    ),
    index("devices_user_id_idx").on(table.userId),
  ],
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    durationKey: text("duration_key").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" })
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }),
    status: text("status").notNull(),
    score: integer("score"),
  },
  (table) => [
    uniqueIndex("game_sessions_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index("game_sessions_user_id_status_idx").on(table.userId, table.status),
    index("game_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const saveStates = pgTable(
  "save_states",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull().default("1.0"),
    stateJson: jsonb("state_json").notNull().default({}),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
);

export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  sessionId: uuid("session_id").references(() => gameSessions.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
