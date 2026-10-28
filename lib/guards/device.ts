import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";

import { readDeviceCookie, setDeviceCookie } from "@/lib/auth/cookies";
import { db } from "@/lib/db/client";
import { devices, users } from "@/lib/db/schema";
import { pgErrorCode } from "@/lib/api/errors";

export function getMaxDevices(): number {
  const raw = process.env.MAX_DEVICES;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

export function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function readExistingDeviceToken(): Promise<string | undefined> {
  const existing = await readDeviceCookie();
  if (existing && existing.length > 0) {
    return existing;
  }
  return undefined;
}

export async function ensureDeviceToken(): Promise<string> {
  const existing = await readExistingDeviceToken();
  if (existing) {
    return existing;
  }

  const raw = randomBytes(32).toString("base64url");
  await setDeviceCookie(raw);
  return raw;
}

/**
 * Best-effort device registration. Never throws DEVICE_LIMIT.
 * Concurrent callers serialize on the user row (FOR UPDATE).
 */
export async function tryRegisterDevice(
  userId: string,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashDeviceToken(rawToken);
  const limit = getMaxDevices();

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update")
        .limit(1);

      if (!locked) {
        return;
      }

      const [existing] = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(eq(devices.userId, userId), eq(devices.tokenHash, tokenHash)),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(devices)
          .set({ lastSeenAt: sql`now()` })
          .where(eq(devices.id, existing.id));
        return;
      }

      const [row] = await tx
        .select({ n: count() })
        .from(devices)
        .where(eq(devices.userId, userId));

      if ((row?.n ?? 0) >= limit) {
        return;
      }

      await tx.insert(devices).values({ userId, tokenHash });
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      return;
    }
    throw err;
  }
}
