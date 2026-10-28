import { z } from "zod";

import {
  type LevelConfig,
  durationMinutesFromSeconds,
} from "@/lib/game/level-config";

/**
 * PHASE_H_PLACEHOLDER — replace with real puzzle IDs from content-config.
 * Demo uses 1–2, detective 1–3, … expert 1–6.
 */
export const PLACEHOLDER_PUZZLE_IDS = [
  "puz_ph_1",
  "puz_ph_2",
  "puz_ph_3",
  "puz_ph_4",
  "puz_ph_5",
  "puz_ph_6",
] as const;

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
  return PLACEHOLDER_PUZZLE_IDS.slice(0, level.puzzleCount);
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
