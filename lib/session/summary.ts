import "server-only";

import { durationMinutesFromSeconds } from "@/lib/game/level-config";
import { toIsoTimestamp } from "@/lib/api/response";

export type SessionSummary = {
  sessionId: string;
  duration: number;
  durationKey: string;
  startedAt: string;
  authoritativeExpiry: string;
  status: string;
};

export function sessionSummary(row: {
  id: string;
  durationSeconds: number;
  durationKey: string;
  startedAt: unknown;
  expiresAt: unknown;
  status: string;
}): SessionSummary {
  return {
    sessionId: row.id,
    duration: durationMinutesFromSeconds(row.durationSeconds),
    durationKey: row.durationKey,
    startedAt: toIsoTimestamp(row.startedAt),
    authoritativeExpiry: toIsoTimestamp(row.expiresAt),
    status: row.status,
  };
}
