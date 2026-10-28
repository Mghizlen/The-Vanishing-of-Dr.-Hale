import "server-only";

import { eq } from "drizzle-orm";

import { readAuthCookie } from "@/lib/auth/cookies";
import { verifyAuthToken } from "@/lib/auth/jwt";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export type AuthUser = {
  id: string;
  username: string;
  cooldownUntil: string | null;
  cooldownReason: string | null;
};

export type VerifyAuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false };

export async function verifyAuth(): Promise<VerifyAuthResult> {
  const token = await readAuthCookie();
  if (!token) {
    return { ok: false };
  }

  let userId: string;
  try {
    ({ userId } = await verifyAuthToken(token));
  } catch {
    return { ok: false };
  }

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      cooldownUntil: users.cooldownUntil,
      cooldownReason: users.cooldownReason,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { ok: false };
  }

  return { ok: true, user };
}
