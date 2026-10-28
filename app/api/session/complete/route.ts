import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonFailure, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { gameSessions, saveStates } from "@/lib/db/schema";
import { levelFromKey } from "@/lib/game/level-config";
import { parseSaveState, requiredPuzzleIds } from "@/lib/game/save-schema";
import { computeScore } from "@/lib/game/scoring";
import { applyCooldown, cooldownDenied, readCooldown } from "@/lib/guards/cooldown";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { verifyDevice } from "@/lib/guards/verify-device";
import { requireExistingDeviceToken } from "@/lib/session/device-gate";
import { sessionSummary } from "@/lib/session/summary";

export const runtime = "nodejs";

type TxOutcome =
  | { kind: "ok"; data: Record<string, unknown>; serverNow: string }
  | { kind: "error"; error: ApiError; serverNow: string };

export async function POST() {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();

    const auth = await verifyAuth();
    if (!auth.ok) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);

    const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
      const user = await lockUserRow(tx, auth.user.id);
      const expired = await lazyExpire(tx, user);

      const nowResult = await tx.execute(sql`select now() as now`);
      const serverNow = toIsoTimestamp(
        (nowResult as { rows?: Array<{ now?: unknown }> }).rows?.[0]?.now,
      );

      const device = await verifyDevice(tx, user.id, rawToken);
      if ("error" in device) {
        return { kind: "error", error: device.error, serverNow };
      }

      const active = await selectActiveSession(tx, user.id);
      if (!active) {
        const cooldown = await readCooldown(tx, user.id);
        if (expired.expiredSessionId) {
          return {
            kind: "error",
            error: new ApiError(ErrorCode.SESSION_EXPIRED, "The session has expired.", {
              cooldownUntil: cooldown.cooldownUntil
                ? toIsoTimestamp(cooldown.cooldownUntil)
                : null,
              reason: cooldown.cooldownReason,
            }),
            serverNow,
          };
        }
        if (cooldown.active) {
          return {
            kind: "error",
            error: cooldownDenied(cooldown.cooldownUntil, cooldown.cooldownReason),
            serverNow,
          };
        }
        return {
          kind: "error",
          error: new ApiError(ErrorCode.VALIDATION_ERROR, "No active session."),
          serverNow,
        };
      }

      const level = levelFromKey(active.durationKey);
      if (!level) {
        throw new Error("Unknown duration key on session");
      }

      const [save] = await tx
        .select()
        .from(saveStates)
        .where(eq(saveStates.sessionId, active.id))
        .limit(1);

      const state = parseSaveState(save?.stateJson);
      const required = requiredPuzzleIds(level);
      const solved = new Set(state?.solvedPuzzles ?? []);
      const complete = required.every((id) => solved.has(id));
      if (!state || !complete) {
        return {
          kind: "error",
          error: new ApiError(ErrorCode.NOT_COMPLETE, "The case is not complete."),
          serverNow,
        };
      }

      const [timing] = await tx
        .select({
          remainingSeconds: sql<number>`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${gameSessions.expiresAt} - now()))))::int`,
        })
        .from(gameSessions)
        .where(eq(gameSessions.id, active.id))
        .limit(1);

      const remainingSeconds = Number(timing?.remainingSeconds ?? 0);
      const score = computeScore(
        required.length,
        state.hintCount,
        remainingSeconds,
        active.durationSeconds,
      );

      await tx
        .update(gameSessions)
        .set({
          status: "completed",
          endedAt: sql`now()`,
          score,
        })
        .where(eq(gameSessions.id, active.id));

      await applyCooldown(tx, user.id, level.cooldownSeconds, "completed");

      const summary = sessionSummary({ ...active, status: "completed" });
      return {
        kind: "ok",
        serverNow,
        data: {
          session: summary,
          status: "completed",
          score,
        },
      };
    });

    if (outcome.kind === "error") {
      return jsonFailure(
        {
          code: outcome.error.code,
          message: outcome.error.message,
          ...outcome.error.extra,
        },
        outcome.serverNow,
        outcome.error.status,
      );
    }

    return jsonSuccess(outcome.data, outcome.serverNow);
  } catch (err) {
    return failClosed(err);
  }
}
