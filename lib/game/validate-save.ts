import "server-only";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { type LevelConfig } from "@/lib/game/level-config";
import {
  isKnownItemId,
  isKnownObjectId,
  parseSaveState,
  requiredPuzzleIds,
  type SaveStateV1,
} from "@/lib/game/save-schema";

function isMonotonicSubset(previous: string[], next: string[]): boolean {
  const nextSet = new Set(next);
  return previous.every((value) => nextSet.has(value)) && new Set(next).size === next.length;
}

export function validateSaveForSession(
  value: unknown,
  previous: SaveStateV1,
  level: LevelConfig,
  session: { id: string; durationMinutes: number; authoritativeExpiry: string },
): SaveStateV1 {
  const parsed = parseSaveState(value);
  if (!parsed) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save data is invalid.");
  }
  if (parsed.sessionId !== session.id || parsed.duration !== session.durationMinutes ||
      parsed.authoritativeExpiry !== session.authoritativeExpiry) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save metadata does not match the session.");
  }
  if (parsed.currentStage < previous.currentStage || parsed.currentStage > level.stages) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save stage is invalid.");
  }
  if (!isMonotonicSubset(previous.inventory, parsed.inventory) ||
      !isMonotonicSubset(previous.inspectedObjects, parsed.inspectedObjects) ||
      !isMonotonicSubset(previous.solvedPuzzles, parsed.solvedPuzzles) ||
      parsed.hintCount !== previous.hintCount) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save contains an invalid progression.");
  }
  if (parsed.inspectedObjects.some((id) => !isKnownObjectId(id)) ||
      parsed.inventory.some((id) => !isKnownItemId(id))) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save contains an unknown content ID.");
  }
  const required = new Set(requiredPuzzleIds(level));
  if (parsed.solvedPuzzles.some((id) => !required.has(id))) {
    throw new ApiError(ErrorCode.SAVE_INVALID, "Save contains an unavailable puzzle.");
  }
  return parsed;
}
