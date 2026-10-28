import "server-only";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { type ApiErrorBody, ErrorCode, HTTP_STATUS, isApiError } from "@/lib/api/errors";

export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  serverNow: string;
};

export type FailureEnvelope = {
  ok: false;
  error: ApiErrorBody;
  serverNow: string;
};

export function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

export function appClockNow(): string {
  return new Date().toISOString();
}

export async function fetchServerNow(): Promise<string> {
  const result = await db.execute<{ now: string }>(sql`select now() as now`);
  const withRows = result as { rows?: Array<{ now?: unknown }> };
  if (withRows.rows?.[0]?.now != null) {
    return toIsoTimestamp(withRows.rows[0].now);
  }
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "now" in result[0]) {
    return toIsoTimestamp((result[0] as { now?: unknown }).now);
  }
  return appClockNow();
}

export function jsonSuccess<T>(data: T, serverNow: string, status = 200): NextResponse<SuccessEnvelope<T>> {
  return NextResponse.json({ ok: true, data, serverNow }, { status });
}

export function jsonFailure(
  error: ApiErrorBody,
  serverNow: string,
  status?: number,
): NextResponse<FailureEnvelope> {
  return NextResponse.json(
    { ok: false, error, serverNow },
    { status: status ?? HTTP_STATUS[error.code] },
  );
}

export async function failClosed(err: unknown): Promise<NextResponse<FailureEnvelope>> {
  if (isApiError(err)) {
    const serverNow =
      err.code === ErrorCode.ORIGIN_MISMATCH ||
      err.code === ErrorCode.VALIDATION_ERROR
        ? appClockNow()
        : await fetchServerNow().catch(appClockNow);
    return jsonFailure(
      { code: err.code, message: err.message, ...err.extra },
      serverNow,
      err.status,
    );
  }

  console.error("Unhandled API error");
  return jsonFailure(
    {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: "Service unavailable. Please try again.",
    },
    appClockNow(),
    503,
  );
}
