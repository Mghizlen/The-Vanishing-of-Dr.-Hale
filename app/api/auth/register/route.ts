import { sql } from "drizzle-orm";

import { ApiError, ErrorCode, pgErrorCode } from "@/lib/api/errors";
import { failClosed, jsonSuccess, toIsoTimestamp } from "@/lib/api/response";
import { parseCredentials, readJsonBody } from "@/lib/auth/credentials";
import { setAuthCookie } from "@/lib/auth/cookies";
import { signAuthToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { auditEvents, users } from "@/lib/db/schema";
import { ensureDeviceToken, tryRegisterDevice } from "@/lib/guards/device";
import { requireJsonContentType, requireMatchingOrigin } from "@/lib/guards/origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireMatchingOrigin();
    await requireJsonContentType();

    const body = parseCredentials(await readJsonBody(request));
    const passwordHash = await hashPassword(body.password);

    let created: { id: string; username: string; serverNow: unknown };
    try {
      const [row] = await db
        .insert(users)
        .values({ username: body.username, passwordHash })
        .returning({
          id: users.id,
          username: users.username,
          serverNow: sql`now()`,
        });
      if (!row) {
        throw new Error("User insert returned no row");
      }
      created = row;
    } catch (err) {
      if (pgErrorCode(err) === "23505") {
        throw new ApiError(ErrorCode.USERNAME_TAKEN, "Username is already taken.");
      }
      throw err;
    }

    const token = await signAuthToken(created.id);
    await setAuthCookie(token);

    const deviceToken = await ensureDeviceToken();
    await tryRegisterDevice(created.id, deviceToken);

    await db.insert(auditEvents).values({
      userId: created.id,
      type: "register",
      detail: { username: created.username },
    });

    return jsonSuccess(
      {
        username: created.username,
        cooldownUntil: null,
        cooldownReason: null,
        activeSession: null,
      },
      toIsoTimestamp(created.serverNow),
    );
  } catch (err) {
    return failClosed(err);
  }
}
