import { and, count, eq, gt, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { parseCredentials, readJsonBody } from "@/lib/auth/credentials";
import { setAuthCookie } from "@/lib/auth/cookies";
import { signAuthToken } from "@/lib/auth/jwt";
import { dummyPasswordCompare, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { auditEvents, users } from "@/lib/db/schema";
import { ensureDeviceToken, tryRegisterDevice } from "@/lib/guards/device";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";

export const runtime = "nodejs";

const RATE_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT = 10;

export async function POST(request: Request) {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();

    const body = parseCredentials(await readJsonBody(request));

    const [rate] = await db
      .select({
        n: count(),
        oldest: sql<string | null>`min(${auditEvents.createdAt})`,
        serverNow: sql`now()`,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.type, "login_failed"),
          sql`${auditEvents.detail}->>'username' = ${body.username}`,
          gt(auditEvents.createdAt, sql`now() - interval '10 minutes'`),
        ),
      );

    const failedCount = Number(rate?.n ?? 0);
    if (failedCount >= RATE_LIMIT) {
      const nowMs = Date.parse(toIsoTimestamp(rate?.serverNow));
      const oldestMs = rate?.oldest ? Date.parse(String(rate.oldest)) : nowMs;
      const elapsedSeconds = Number.isFinite(nowMs) && Number.isFinite(oldestMs)
        ? Math.max(0, Math.floor((nowMs - oldestMs) / 1000))
        : 0;
      const retryAfterSeconds = Math.max(1, RATE_WINDOW_SECONDS - elapsedSeconds);
      throw new ApiError(ErrorCode.RATE_LIMITED, "Too many login attempts. Try again later.", {
        retryAfterSeconds,
      });
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
        cooldownUntil: users.cooldownUntil,
        cooldownReason: users.cooldownReason,
        serverNow: sql`now()`,
      })
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);

    if (!user) {
      await dummyPasswordCompare(body.password);
      await db.insert(auditEvents).values({
        userId: null,
        type: "login_failed",
        detail: { username: body.username },
      });
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, "Invalid username or password.");
    }

    const matches = await verifyPassword(body.password, user.passwordHash);
    if (!matches) {
      await db.insert(auditEvents).values({
        userId: user.id,
        type: "login_failed",
        detail: { username: user.username },
      });
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, "Invalid username or password.");
    }

    const token = await signAuthToken(user.id);
    await setAuthCookie(token);

    const deviceToken = await ensureDeviceToken();
    await tryRegisterDevice(user.id, deviceToken);

    await db.insert(auditEvents).values({
      userId: user.id,
      type: "login_success",
      detail: { username: user.username },
    });

    return jsonSuccess(
      {
        username: user.username,
        cooldownUntil: user.cooldownUntil,
        cooldownReason: user.cooldownReason,
        activeSession: null,
      },
      toIsoTimestamp(user.serverNow),
    );
  } catch (err) {
    return failClosed(err);
  }
}
