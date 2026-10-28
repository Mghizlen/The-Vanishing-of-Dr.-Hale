import { ApiError, ErrorCode } from "@/lib/api/errors";
import { failClosed, fetchServerNow, jsonSuccess } from "@/lib/api/response";
import { verifyAuth } from "@/lib/guards/verify-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await verifyAuth();
    if (!auth.ok) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, "Authentication required.");
    }

    const serverNow = await fetchServerNow();

    return jsonSuccess(
      {
        username: auth.user.username,
        cooldownUntil: auth.user.cooldownUntil,
        cooldownReason: auth.user.cooldownReason,
        activeSession: null,
      },
      serverNow,
    );
  } catch (err) {
    return failClosed(err);
  }
}
