import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonFailure, jsonSuccess } from "@/lib/api/response";
import { readJsonBody } from "@/lib/auth/credentials";
import { db } from "@/lib/db/client";
import { gameSessions, saveStates, auditEvents } from "@/lib/db/schema";
import { levelFromKey } from "@/lib/game/level-config";
import { databaseNow } from "@/lib/game/tx-time";
import { validateSaveForSession } from "@/lib/game/validate-save";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { verifyDevice } from "@/lib/guards/verify-device";
import { requireExistingDeviceToken } from "@/lib/session/device-gate";
import { sessionSummary } from "@/lib/session/summary";

export const runtime = "nodejs";

type TxOutcome = { data: Record<string, unknown>; serverNow: string } | { error: ApiError; serverNow: string };

function stateBody(save: typeof saveStates.$inferSelect, session: typeof gameSessions.$inferSelect) {
  return { state: save.stateJson, revision: save.revision, session: sessionSummary(session) };
}

async function getAuth() {
  const auth = await verifyAuth();
  if (!auth.ok) throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
  return auth;
}

export async function GET() {
  try {
    const auth = await getAuth();
    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);
    const result = await db.transaction(async (tx): Promise<TxOutcome> => {
      const user = await lockUserRow(tx, auth.user.id);
      const expired = await lazyExpire(tx, user);
      const serverNow = await databaseNow(tx);
      const device = await verifyDevice(tx, user.id, rawToken);
      if ("error" in device) return { error: device.error, serverNow };
      const active = await selectActiveSession(tx, user.id);
      if (!active) {
        return { error: new ApiError(expired.expiredSessionId ? ErrorCode.SESSION_EXPIRED : ErrorCode.VALIDATION_ERROR, expired.expiredSessionId ? "The session has expired." : "No active session."), serverNow };
      }
      const [save] = await tx.select().from(saveStates).where(eq(saveStates.sessionId, active.id)).limit(1);
      if (!save) throw new Error("Active session has no save state.");
      return { data: stateBody(save, active), serverNow };
    });
    if ("error" in result) return jsonFailure({ code: result.error.code, message: result.error.message, ...result.error.extra }, result.serverNow, result.error.status);
    return jsonSuccess(result.data, result.serverNow);
  } catch (error) {
    return failClosed(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();
    const auth = await getAuth();
    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);
    const body = await readJsonBody(request);
    const revision = body && typeof body === "object" && "revision" in body ? (body as { revision?: unknown }).revision : undefined;
    const proposed = body && typeof body === "object" && "state" in body ? (body as { state?: unknown }).state : undefined;
    if (typeof revision !== "number" || !Number.isInteger(revision)) throw new ApiError(ErrorCode.SAVE_INVALID, "Revision is invalid.");
    const result = await db.transaction(async (tx): Promise<TxOutcome> => {
      const user = await lockUserRow(tx, auth.user.id);
      const expired = await lazyExpire(tx, user);
      const serverNow = await databaseNow(tx);
      const device = await verifyDevice(tx, user.id, rawToken);
      if ("error" in device) return { error: device.error, serverNow };
      const active = await selectActiveSession(tx, user.id);
      if (!active) return { error: new ApiError(expired.expiredSessionId ? ErrorCode.SESSION_EXPIRED : ErrorCode.VALIDATION_ERROR, expired.expiredSessionId ? "The session has expired." : "No active session."), serverNow };
      const [save] = await tx.select().from(saveStates).where(eq(saveStates.sessionId, active.id)).limit(1);
      if (!save) throw new Error("Active session has no save state.");
      const current = save.stateJson as Parameters<typeof validateSaveForSession>[1];
      if (revision !== save.revision) {
        return { error: new ApiError(ErrorCode.SAVE_CONFLICT, "Save revision conflict.", { revision: save.revision, serverState: save.stateJson }), serverNow };
      }
      const level = levelFromKey(active.durationKey);
      if (!level) throw new Error("Unknown duration key on session.");
      let next;
      try {
        next = validateSaveForSession(proposed, current, level, {
          id: active.id,
          durationMinutes: Math.round(active.durationSeconds / 60),
          authoritativeExpiry: active.expiresAt,
        });
      } catch (error) {
        await tx.insert(auditEvents).values({ userId: user.id, sessionId: active.id, type: "save_rejected", detail: { reason: "validation" } });
        throw error;
      }
      await tx.update(saveStates).set({ stateJson: next, revision: sql`${saveStates.revision} + 1`, updatedAt: sql`now()` }).where(eq(saveStates.sessionId, active.id));
      const [updated] = await tx.select().from(saveStates).where(eq(saveStates.sessionId, active.id)).limit(1);
      if (!updated) throw new Error("Save update failed.");
      return { data: stateBody(updated, active), serverNow };
    });
    if ("error" in result) return jsonFailure({ code: result.error.code, message: result.error.message, ...result.error.extra }, result.serverNow, result.error.status);
    return jsonSuccess(result.data, result.serverNow);
  } catch (error) {
    return failClosed(error);
  }
}
