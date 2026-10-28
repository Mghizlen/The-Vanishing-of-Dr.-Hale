import "server-only";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { auditEvents } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { ensureDeviceToken, readExistingDeviceToken } from "@/lib/guards/device";

export async function requireExistingDeviceToken(
  userId: string,
  username: string,
): Promise<string> {
  const existing = await readExistingDeviceToken();
  if (existing) {
    return existing;
  }

  await ensureDeviceToken();
  try {
    await db.insert(auditEvents).values({
      userId,
      type: "start_denied_device",
      detail: { username, reason: "missing" },
    });
  } catch {
    // still return DEVICE_MISSING
  }
  throw new ApiError(
    ErrorCode.DEVICE_MISSING,
    "Device cookie is missing. Retry once after it is set.",
  );
}

export async function recordStartFailed(userId: string, username: string): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      userId,
      type: "start_failed",
      detail: { username },
    });
  } catch {
    // swallow so 503 still returns if the database is down
  }
}
