import "server-only";

import { headers } from "next/headers";

import { ApiError, ErrorCode } from "@/lib/api/errors";

const DEV_ORIGIN = "http://localhost:3000";

function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function requireJsonContentType(): Promise<void> {
  const headerList = await headers();
  const raw = headerList.get("content-type");
  const media = raw?.split(";")[0]?.trim().toLowerCase();
  if (media !== "application/json") {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, "Invalid request.");
  }
}

export async function requireMatchingOrigin(): Promise<void> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const isProduction = process.env.NODE_ENV === "production";
  const appOrigin = process.env.APP_ORIGIN
    ? normalizeOrigin(process.env.APP_ORIGIN)
    : "";

  if (isProduction) {
    if (!origin || !appOrigin || normalizeOrigin(origin) !== appOrigin) {
      throw new ApiError(ErrorCode.ORIGIN_MISMATCH, "Request origin is not allowed.");
    }
    return;
  }

  if (!origin) {
    return;
  }

  const normalized = normalizeOrigin(origin);
  const allowed = new Set<string>([DEV_ORIGIN]);
  if (appOrigin) {
    allowed.add(appOrigin);
  }
  if (!allowed.has(normalized)) {
    throw new ApiError(ErrorCode.ORIGIN_MISMATCH, "Request origin is not allowed.");
  }
}
