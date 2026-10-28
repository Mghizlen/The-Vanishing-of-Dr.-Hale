import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { ApiError, ErrorCode } from "@/lib/api/errors";
import { devices } from "@/lib/db/schema";
import type { DbTx } from "@/lib/db/tx";
import { getMaxDevices, hashDeviceToken } from "@/lib/guards/device";

export async function verifyDevice(
  tx: DbTx,
  userId: string,
  rawToken: string,
): Promise<{ deviceId: string } | { error: ApiError }> {
  const tokenHash = hashDeviceToken(rawToken);
  const limit = getMaxDevices();

  const [existing] = await tx
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.tokenHash, tokenHash)))
    .limit(1);

  if (existing) {
    await tx
      .update(devices)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(devices.id, existing.id));
    return { deviceId: existing.id };
  }

  const [row] = await tx
    .select({ n: count() })
    .from(devices)
    .where(eq(devices.userId, userId));

  if ((row?.n ?? 0) >= limit) {
    return {
      error: new ApiError(
        ErrorCode.DEVICE_LIMIT,
        "This account has reached its device limit.",
        { maxDevices: limit },
      ),
    };
  }

  const [created] = await tx
    .insert(devices)
    .values({ userId, tokenHash })
    .returning({ id: devices.id });

  if (!created) {
    throw new Error("Device insert returned no row");
  }
  return { deviceId: created.id };
}
