import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { readCooldown } from "@/lib/guards/cooldown";
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
      const serverNow = toIsoTimestamp(
        (nowResult as { rows?: Array<{ now?: unknown }> }).rows?.[0]?.now,
      );

      const cooldown = await readCooldown(tx, user.id);
      const active = await selectActiveSession(tx, user.id);

      return {
        serverNow,
        data: {
          username: user.username,
          cooldownUntil: cooldown.cooldownUntil
            ? toIsoTimestamp(cooldown.cooldownUntil)
            : null,
          cooldownReason: cooldown.cooldownReason,
          activeSession: active ? sessionSummary(active) : null,
        },
      };
    });

    return jsonSuccess(payload.data, payload.serverNow);
  } catch (err) {
    return failClosed(err);
  }
}
