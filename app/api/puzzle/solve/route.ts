import { eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonFailure, jsonSuccess } from "@/lib/api/response";
import { readJsonBody } from "@/lib/auth/credentials";
import { db } from "@/lib/db/client";
import { saveStates } from "@/lib/db/schema";
import { isPuzzleSolution } from "@/lib/game/solutions.server";
import { puzzleById } from "@/lib/game/content-config";
import { parseSaveState, requiredPuzzleIds } from "@/lib/game/save-schema";
import { levelFromKey } from "@/lib/game/level-config";
import { databaseNow } from "@/lib/game/tx-time";
import { lazyExpire, lockUserRow, selectActiveSession } from "@/lib/guards/lazy-expire";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { verifyDevice } from "@/lib/guards/verify-device";
import { requireExistingDeviceToken } from "@/lib/session/device-gate";

export const runtime = "nodejs";
type SolveOutcome =
  | { data: { state: ReturnType<typeof parseSaveState> extends infer T ? T : never; revision: number }; serverNow: string }
  | { error: ApiError; serverNow: string };

export async function POST(request: Request) {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();
    const auth = await verifyAuth();
    if (!auth.ok) throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);
    const body = await readJsonBody(request);
    const id = body && typeof body === "object" && "puzzleId" in body ? (body as { puzzleId?: unknown }).puzzleId : undefined;
    const answer = body && typeof body === "object" && "answer" in body ? (body as { answer?: unknown }).answer : undefined;
    if (typeof id !== "string" || typeof answer !== "string" || !isPuzzleSolution(id, answer)) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, "That answer does not solve the puzzle.");
    }
    const result = await db.transaction(async (tx): Promise<SolveOutcome> => {
      const user = await lockUserRow(tx, auth.user.id);
      const expired = await lazyExpire(tx, user);
      const serverNow = await databaseNow(tx);
      const device = await verifyDevice(tx, user.id, rawToken);
      if ("error" in device) return { error: device.error, serverNow };
      const active = await selectActiveSession(tx, user.id);
      if (!active) return { error: new ApiError(expired.expiredSessionId ? ErrorCode.SESSION_EXPIRED : ErrorCode.VALIDATION_ERROR, "No active session."), serverNow };
      const level = levelFromKey(active.durationKey);
      const [save] = await tx.select().from(saveStates).where(eq(saveStates.sessionId, active.id)).limit(1);
      const state = parseSaveState(save?.stateJson);
      if (!level || !save || !state || !requiredPuzzleIds(level).includes(id)) throw new ApiError(ErrorCode.SAVE_INVALID, "Puzzle is not available.");
      if (state.solvedPuzzles.includes(id)) return { data: { state, revision: save.revision }, serverNow };
      const next = { ...state, solvedPuzzles: [...state.solvedPuzzles, id], currentStage: Math.max(state.currentStage, puzzleById(id)?.stage ?? state.currentStage) };
      await tx.update(saveStates).set({ stateJson: next, revision: sql`${save.revision} + 1`, updatedAt: sql`now()` }).where(eq(saveStates.sessionId, active.id));
      return { data: { state: next, revision: save.revision + 1 }, serverNow };
    });
    if ("error" in result) return jsonFailure({ code: result.error.code, message: result.error.message, ...result.error.extra }, result.serverNow, result.error.status);
    return jsonSuccess(result.data, result.serverNow);
  } catch (error) {
    return failClosed(error);
  }
}
