import { ErrorCode } from "@/lib/api/errors";
import { failClosed, fetchServerNow, jsonFailure, jsonSuccess } from "@/lib/api/response";
import { clearAuthCookie } from "@/lib/auth/cookies";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { requireMatchingOrigin } from "@/lib/guards/origin";
import { verifyAuth } from "@/lib/guards/verify-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireMatchingOrigin();
  } catch (err) {
    return failClosed(err);
  }

  try {
    const auth = await verifyAuth();
    await clearAuthCookie();

    if (!auth.ok) {
      const serverNow = await fetchServerNow().catch(() => new Date().toISOString());
      return jsonFailure(
        { code: ErrorCode.UNAUTHENTICATED, message: "Authentication required." },
        serverNow,
      );
    }

    const [row] = await db
      .insert(auditEvents)
      .values({
        userId: auth.user.id,
        type: "logout",
        detail: { username: auth.user.username },
      })
      .returning({ serverNow: auditEvents.createdAt });

    return jsonSuccess({ loggedOut: true }, row?.serverNow ?? (await fetchServerNow()));
  } catch (err) {
    await clearAuthCookie().catch(() => undefined);
    return failClosed(err);
  }
}
