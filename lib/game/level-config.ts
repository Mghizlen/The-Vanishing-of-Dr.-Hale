/** Single source of truth for durations, hint caps, and cooldowns. */

export const DURATION_MINUTES = [10, 15, 30, 60, 90] as const;
export type DurationMinutes = (typeof DURATION_MINUTES)[number];

export type LevelKey =
  | "demo"
  | "detective"
  | "investigator"
  | "master"
  | "expert";

export type LevelConfig = {
  key: LevelKey;
  durationMinutes: DurationMinutes;
  durationSeconds: number;
  stages: number;
  puzzleCount: number;
  maxHints: number;
  cooldownSeconds: number;
};

function demoCooldownSeconds(): number {
  const raw = process.env.DEMO_COOLDOWN_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
}

const LEVEL_BY_MINUTES: Record<DurationMinutes, Omit<LevelConfig, "cooldownSeconds"> & { cooldownSeconds: number }> = {
  10: {
    key: "demo",
    durationMinutes: 10,
    durationSeconds: 10 * 60,
    stages: 1,
    puzzleCount: 2,
    maxHints: 3,
    cooldownSeconds: demoCooldownSeconds(),
  },
  15: {
    key: "detective",
    durationMinutes: 15,
    durationSeconds: 15 * 60,
    stages: 2,
    puzzleCount: 3,
    maxHints: 5,
    cooldownSeconds: 30 * 60,
  },
  30: {
    key: "investigator",
    durationMinutes: 30,
    durationSeconds: 30 * 60,
    stages: 3,
    puzzleCount: 4,
    maxHints: 4,
    cooldownSeconds: 60 * 60,
  },
  60: {
    key: "master",
    durationMinutes: 60,
    durationSeconds: 60 * 60,
    stages: 4,
    puzzleCount: 5,
    maxHints: 3,
    cooldownSeconds: 120 * 60,
  },
  90: {
    key: "expert",
    durationMinutes: 90,
    durationSeconds: 90 * 60,
    stages: 5,
    puzzleCount: 6,
    maxHints: 2,
    cooldownSeconds: 180 * 60,
  },
};

export function isDurationMinutes(value: unknown): value is DurationMinutes {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (DURATION_MINUTES as readonly number[]).includes(value)
  );
}

export function levelFromDurationMinutes(minutes: DurationMinutes): LevelConfig {
  const level = LEVEL_BY_MINUTES[minutes];
  if (minutes === 10) {
    return { ...level, cooldownSeconds: demoCooldownSeconds() };
  }
  return level;
}

export function levelFromKey(key: string): LevelConfig | null {
  const found = Object.values(LEVEL_BY_MINUTES).find((level) => level.key === key);
  if (!found) {
    return null;
  }
  if (found.key === "demo") {
    return { ...found, cooldownSeconds: demoCooldownSeconds() };
  }
  return found;
}

export function durationMinutesFromSeconds(durationSeconds: number): number {
  return Math.round(durationSeconds / 60);
}
