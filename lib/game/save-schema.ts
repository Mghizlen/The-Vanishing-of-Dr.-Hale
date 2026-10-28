import { z } from "zod";

import { type LevelConfig, durationMinutesFromSeconds } from "@/lib/game/level-config";
import { CONTENT_OBJECT_IDS, CONTENT_ITEM_IDS, CONTENT_PUZZLE_IDS } from "@/lib/game/content-config";

/**
 * The save document contains IDs only. Content and solutions remain server-only.
 */
export const saveStateSchema = z.object({
  schemaVersion: z.literal("1.0"),
  sessionId: z.string(),
  duration: z.number().int(),
  authoritativeExpiry: z.string(),
  currentStage: z.number().int().min(1).max(5),
  inventory: z.array(z.string()),
  inspectedObjects: z.array(z.string()),
  solvedPuzzles: z.array(z.string()),
  hintCount: z.number().int().min(0),
});

export type SaveStateV1 = z.output<typeof saveStateSchema>;

export function requiredPuzzleIds(level: LevelConfig): string[] {
  return CONTENT_PUZZLE_IDS.slice(0, level.puzzleCount).map((puzzle) => puzzle.id);
}

export function isKnownObjectId(id: string): boolean {
  return CONTENT_OBJECT_IDS.has(id);
}

export function isKnownItemId(id: string): boolean {
  return CONTENT_ITEM_IDS.has(id);
}

export function buildInitialState(input: {
  sessionId: string;
  durationMinutes: number;
  authoritativeExpiry: string;
}): SaveStateV1 {
  return {
    schemaVersion: "1.0",
    sessionId: input.sessionId,
    duration: input.durationMinutes,
    authoritativeExpiry: input.authoritativeExpiry,
    currentStage: 1,
    inventory: [],
    inspectedObjects: [],
    solvedPuzzles: [],
    hintCount: 0,
  };
}

export function parseSaveState(value: unknown): SaveStateV1 | null {
  const parsed = saveStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function levelDurationMinutes(durationSeconds: number): number {
  return durationMinutesFromSeconds(durationSeconds);
}
