import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { gameSessions } from "@/lib/db/schema";
import { readCooldown } from "@/lib/guards/cooldown";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { sessionSummary } from "@/lib/session/summary";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await verifyAuth();
    if (!auth.ok) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const payload = await db.transaction(async (tx) => {
      const user = await lockUserRow(tx, auth.user.id);
      await lazyExpire(tx, user);

      const nowResult = await tx.execute(sql`select now() as now`);
      const withRows = nowResult as { rows?: Array<{ now?: unknown }> };
      const serverNow = toIsoTimestamp(withRows.rows?.[0]?.now);

      const active = await selectActiveSession(tx, user.id);
      if (active) {
        const [timing] = await tx
          .select({
            remainingSeconds: sql<number>`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${gameSessions.expiresAt} - now()))))::int`,
          })
          .from(gameSessions)
          .where(eq(gameSessions.id, active.id))
          .limit(1);

        return {
          serverNow,
          data: {
            state: "active" as const,
            session: sessionSummary(active),
            remainingSeconds: Number(timing?.remainingSeconds ?? 0),
          },
        };
      }

      const cooldown = await readCooldown(tx, user.id);
      if (cooldown.active) {
        return {
          serverNow,
          data: {
            state: "cooldown" as const,
            cooldownUntil: cooldown.cooldownUntil
              ? toIsoTimestamp(cooldown.cooldownUntil)
              : null,
            reason: cooldown.cooldownReason,
          },
        };
      }

      return { serverNow, data: { state: "none" as const } };
    });

    return jsonSuccess(payload.data, payload.serverNow);
  } catch (err) {
    return failClosed(err);
  }
}
