import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonFailure, jsonSuccess } from "@/lib/api/response";
import { readJsonBody } from "@/lib/auth/credentials";
import { db } from "@/lib/db/client";
import { saveStates } from "@/lib/db/schema";
import { hintForPuzzle } from "@/lib/game/hints.server";
import { levelFromKey } from "@/lib/game/level-config";
import { parseSaveState, requiredPuzzleIds } from "@/lib/game/save-schema";
import { databaseNow } from "@/lib/game/tx-time";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { verifyDevice } from "@/lib/guards/verify-device";
import { requireExistingDeviceToken } from "@/lib/session/device-gate";

export const runtime = "nodejs";

type HintOutcome =
  | { data: { hint: string; puzzleId: string; hintCount: number; revision: number }; serverNow: string }
  | { error: ApiError; serverNow: string };

export async function POST(request: Request) {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();
    const auth = await verifyAuth();
    if (!auth.ok) throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);
    const body = await readJsonBody(request);
    const requestedPuzzle = body && typeof body === "object" && "puzzleId" in body ? (body as { puzzleId?: unknown }).puzzleId : undefined;
    const result = await db.transaction(async (tx): Promise<HintOutcome> => {
      const user = await lockUserRow(tx, auth.user.id);
      const expired = await lazyExpire(tx, user);
      const serverNow = await databaseNow(tx);
      const device = await verifyDevice(tx, user.id, rawToken);
      if ("error" in device) return { error: device.error, serverNow };
      const active = await selectActiveSession(tx, user.id);
      if (!active) return { error: new ApiError(expired.expiredSessionId ? ErrorCode.SESSION_EXPIRED : ErrorCode.VALIDATION_ERROR, expired.expiredSessionId ? "The session has expired." : "No active session."), serverNow };
      const level = levelFromKey(active.durationKey);
      if (!level) throw new Error("Unknown duration key on session.");
      const [save] = await tx.select().from(saveStates).where(eq(saveStates.sessionId, active.id)).limit(1);
      const state = parseSaveState(save?.stateJson);
      if (!save || !state) throw new Error("Active session has invalid save state.");
      const puzzleId = typeof requestedPuzzle === "string" ? requestedPuzzle : requiredPuzzleIds(level)[Math.min(state.solvedPuzzles.length, level.puzzleCount - 1)];
      if (!requiredPuzzleIds(level).includes(puzzleId)) throw new ApiError(ErrorCode.SAVE_INVALID, "Puzzle is not available.");
      if (state.hintCount >= level.maxHints) return { error: new ApiError(ErrorCode.HINT_LIMIT, "No hints remain.", { revision: save.revision }), serverNow };
      const next = { ...state, hintCount: state.hintCount + 1 };
      await tx.update(saveStates).set({ stateJson: next, revision: sql`${saveStates.revision} + 1`, updatedAt: sql`now()` }).where(eq(saveStates.sessionId, active.id));
      return { data: { hint: hintForPuzzle(puzzleId), puzzleId, hintCount: next.hintCount, revision: save.revision + 1 }, serverNow };
    });
    if ("error" in result) return jsonFailure({ code: result.error.code, message: result.error.message, ...result.error.extra }, result.serverNow, result.error.status);
    return jsonSuccess(result.data, result.serverNow);
  } catch (error) {
    return failClosed(error);
  }
}
