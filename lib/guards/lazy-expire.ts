import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { levelFromKey } from "@/lib/game/level-config";
import { db } from "@/lib/db/client";
import { auditEvents, gameSessions, users } from "@/lib/db/schema";
import type { DbTx } from "@/lib/db/tx";

export type LockedUser = {
  id: string;
  username: string;
  cooldownUntil: string | null;
  cooldownReason: string | null;
};

export async function lockUserRow(tx: DbTx, userId: string): Promise<LockedUser> {
  const [user] = await tx
    .select({
      id: users.id,
      username: users.username,
      cooldownUntil: users.cooldownUntil,
      cooldownReason: users.cooldownReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for("update")
    .limit(1);

  if (!user) {
    throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
  }
  return user;
}

export async function selectActiveSession(tx: DbTx, userId: string) {
  const [session] = await tx
    .select()
    .from(gameSessions)
    .where(
      and(eq(gameSessions.userId, userId), eq(gameSessions.status, "active")),
    )
    .limit(1);
  return session ?? null;
}

/**
 * If the active session's expires_at <= now(), mark expired, set ended_at,
 * apply account cooldown, and write session_expired. Caller must hold FOR UPDATE
 * on the user row. Returns the session that was expired, if any.
 */
export async function lazyExpire(
  tx: DbTx,
  user: LockedUser,
): Promise<{ expiredSessionId: string | null }> {
  const [due] = await tx
    .select()
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.userId, user.id),
        eq(gameSessions.status, "active"),
        sql`${gameSessions.expiresAt} <= now()`,
      ),
    )
    .limit(1);

  if (!due) {
    return { expiredSessionId: null };
  }

  const level = levelFromKey(due.durationKey);
  if (!level) {
    throw new Error("Unknown duration key on session");
  }

  await tx
    .update(gameSessions)
    .set({
      status: "expired",
      endedAt: sql`now()`,
    })
    .where(eq(gameSessions.id, due.id));

  await tx
    .update(users)
    .set({
      cooldownUntil: sql`now() + make_interval(secs => ${level.cooldownSeconds})`,
      cooldownReason: "expired",
    })
    .where(eq(users.id, user.id));

  await tx.insert(auditEvents).values({
    userId: user.id,
    sessionId: due.id,
    type: "session_expired",
    detail: { username: user.username, durationKey: due.durationKey },
  });

  return { expiredSessionId: due.id };
}

export async function withUserLock<T>(
  userId: string,
  fn: (tx: DbTx, user: LockedUser) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const user = await lockUserRow(tx, userId);
    return fn(tx, user);
  });
}
