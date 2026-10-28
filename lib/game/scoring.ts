import "server-only";

/** 16.7: score = (solved × 100) - (hints × 10) + round(100 × remaining / duration). Min 0. */
export function computeScore(
  solvedCount: number,
  hintCount: number,
  remainingSeconds: number,
  durationSeconds: number,
): number {
  const timeBonus =
    durationSeconds > 0
      ? Math.round((100 * remainingSeconds) / durationSeconds)
      : 0;
  return Math.max(0, solvedCount * 100 - hintCount * 10 + timeBonus);
}
