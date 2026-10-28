import "server-only";

import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { toIsoTimestamp } from "@/lib/api/response";
import { users } from "@/lib/db/schema";
import type { DbTx } from "@/lib/db/tx";
import type { LockedUser } from "@/lib/guards/lazy-expire";

export async function readCooldown(
  tx: DbTx,
  userId: string,
): Promise<{ cooldownUntil: string | null; cooldownReason: string | null; active: boolean }> {
  const [row] = await tx
    .select({
      cooldownUntil: users.cooldownUntil,
      cooldownReason: users.cooldownReason,
      active: sql<number>`case when ${users.cooldownUntil} is not null and ${users.cooldownUntil} > now() then 1 else 0 end`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    cooldownUntil: row?.cooldownUntil ?? null,
    cooldownReason: row?.cooldownReason ?? null,
    active: Number(row?.active) === 1,
  };
}

export function cooldownDenied(
  cooldownUntil: string | null,
  reason: string | null,
): ApiError {
  return new ApiError(ErrorCode.COOLDOWN_ACTIVE, "This account is on cooldown.", {
    cooldownUntil: cooldownUntil ? toIsoTimestamp(cooldownUntil) : null,
    reason,
  });
}

export async function enforceCooldown(tx: DbTx, user: LockedUser): Promise<ApiError | null> {
  const state = await readCooldown(tx, user.id);
  if (!state.active) {
    return null;
  }
  return cooldownDenied(state.cooldownUntil, state.cooldownReason);
}

export async function applyCooldown(
  tx: DbTx,
  userId: string,
  cooldownSeconds: number,
  reason: "expired" | "abandoned" | "completed" | "integrity_violation",
): Promise<void> {
  await tx
    .update(users)
    .set({
      cooldownUntil: sql`now() + make_interval(secs => ${cooldownSeconds})`,
      cooldownReason: reason,
    })
    .where(eq(users.id, userId));
}
