import { and, eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode, isApiError, pgErrorCode } from "@/lib/api/errors";
import { failClosed, jsonFailure, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { readJsonBody } from "@/lib/auth/credentials";
import { db } from "@/lib/db/client";
import { auditEvents, gameSessions, saveStates } from "@/lib/db/schema";
import { isDurationMinutes, levelFromDurationMinutes } from "@/lib/game/level-config";
import { buildInitialState } from "@/lib/game/save-schema";
import { enforceCooldown } from "@/lib/guards/cooldown";
import {
  lazyExpire,
  lockUserRow,
  selectActiveSession,
} from "@/lib/guards/lazy-expire";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";
import { verifyDevice } from "@/lib/guards/verify-device";
import { recordStartFailed, requireExistingDeviceToken } from "@/lib/session/device-gate";
import { sessionSummary } from "@/lib/session/summary";

export const runtime = "nodejs";

type TxOutcome =
  | { kind: "ok"; data: Record<string, unknown>; serverNow: string }
  | { kind: "error"; error: ApiError; serverNow: string };

async function txNow(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  const result = await tx.execute(sql`select now() as now`);
  const withRows = result as { rows?: Array<{ now?: unknown }> };
  if (withRows.rows?.[0]?.now != null) {
    return toIsoTimestamp(withRows.rows[0].now);
  }
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "now" in result[0]) {
    return toIsoTimestamp((result[0] as { now?: unknown }).now);
  }
  throw new Error("Failed to read database time");
}

export async function POST(request: Request) {
  let userId: string | undefined;
  let username: string | undefined;

  try {
    await requireMatchingOrigin();
    await requireJsonContentType();

    const auth = await verifyAuth();
    if (!auth.ok) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }
    userId = auth.user.id;
    username = auth.user.username;

    const body = await readJsonBody(request);
    const durationValue =
      body && typeof body === "object" && "duration" in body
        ? (body as { duration: unknown }).duration
        : undefined;
    if (!isDurationMinutes(durationValue)) {
      throw new ApiError(ErrorCode.INVALID_DURATION, "Duration is not allowed.");
    }
    const level = levelFromDurationMinutes(durationValue);

    const rawToken = await requireExistingDeviceToken(auth.user.id, auth.user.username);

    let outcome: TxOutcome;
    try {
      outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
        const user = await lockUserRow(tx, auth.user.id);
        await lazyExpire(tx, user);
        const serverNow = await txNow(tx);

        const cooldownError = await enforceCooldown(tx, user);
        if (cooldownError) {
          await tx.insert(auditEvents).values({
            userId: user.id,
            type: "start_denied_cooldown",
            detail: { username: user.username },
          });
          return { kind: "error", error: cooldownError, serverNow };
        }

        const device = await verifyDevice(tx, user.id, rawToken);
        if ("error" in device) {
          await tx.insert(auditEvents).values({
            userId: user.id,
            type: "start_denied_device",
            detail: { username: user.username, reason: "limit" },
          });
          return { kind: "error", error: device.error, serverNow };
        }

        const existing = await selectActiveSession(tx, user.id);
        if (existing) {
          const summary = sessionSummary(existing);
          return {
            kind: "error",
            error: new ApiError(
              ErrorCode.ACTIVE_SESSION_EXISTS,
              "An active session already exists.",
              {
                sessionId: summary.sessionId,
                duration: summary.duration,
                startedAt: summary.startedAt,
                authoritativeExpiry: summary.authoritativeExpiry,
                status: summary.status,
              },
            ),
            serverNow,
          };
        }

        const [created] = await tx
          .insert(gameSessions)
          .values({
            userId: user.id,
            deviceId: device.deviceId,
            durationKey: level.key,
            durationSeconds: level.durationSeconds,
            startedAt: sql`now()`,
            expiresAt: sql`now() + make_interval(secs => ${level.durationSeconds})`,
            status: "active",
          })
          .returning({
            id: gameSessions.id,
            durationSeconds: gameSessions.durationSeconds,
            durationKey: gameSessions.durationKey,
            startedAt: gameSessions.startedAt,
            expiresAt: gameSessions.expiresAt,
            status: gameSessions.status,
          });

        if (!created) {
          throw new Error("Session insert returned no row");
        }

        const summary = sessionSummary(created);
        const initialState = buildInitialState({
          sessionId: summary.sessionId,
          durationMinutes: summary.duration,
          authoritativeExpiry: summary.authoritativeExpiry,
        });

        await tx.insert(saveStates).values({
          sessionId: created.id,
          schemaVersion: "1.0",
          stateJson: initialState,
          revision: 0,
          updatedAt: sql`now()`,
        });

        await tx.insert(auditEvents).values({
          userId: user.id,
          sessionId: created.id,
          type: "session_started",
          detail: {
            username: user.username,
            durationKey: level.key,
            sessionId: created.id,
          },
        });

        return {
          kind: "ok",
          serverNow: summary.startedAt,
          data: {
            sessionId: summary.sessionId,
            duration: summary.duration,
            startedAt: summary.startedAt,
            authoritativeExpiry: summary.authoritativeExpiry,
            initialState,
          },
        };
      });
    } catch (err) {
      if (pgErrorCode(err) === "23505") {
        const [active] = await db
          .select()
          .from(gameSessions)
          .where(
            and(
              eq(gameSessions.userId, auth.user.id),
              eq(gameSessions.status, "active"),
            ),
          )
          .limit(1);
        if (active) {
          const summary = sessionSummary(active);
          throw new ApiError(
            ErrorCode.ACTIVE_SESSION_EXISTS,
            "An active session already exists.",
            {
              sessionId: summary.sessionId,
              duration: summary.duration,
              startedAt: summary.startedAt,
              authoritativeExpiry: summary.authoritativeExpiry,
              status: summary.status,
            },
          );
        }
      }
      throw err;
    }

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
    if (!isApiError(err) && userId && username) {
      await recordStartFailed(userId, username);
    }
    return failClosed(err);
  }
}
