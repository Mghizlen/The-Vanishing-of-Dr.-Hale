import "server-only";

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USERNAME_TAKEN: "USERNAME_TAKEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ORIGIN_MISMATCH: "ORIGIN_MISMATCH",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INVALID_DURATION: "INVALID_DURATION",
  COOLDOWN_ACTIVE: "COOLDOWN_ACTIVE",
  DEVICE_LIMIT: "DEVICE_LIMIT",
  DEVICE_MISSING: "DEVICE_MISSING",
  ACTIVE_SESSION_EXISTS: "ACTIVE_SESSION_EXISTS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  NOT_COMPLETE: "NOT_COMPLETE",
  SAVE_INVALID: "SAVE_INVALID",
  SAVE_CONFLICT: "SAVE_CONFLICT",
  HINT_LIMIT: "HINT_LIMIT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  USERNAME_TAKEN: 409,
  VALIDATION_ERROR: 400,
  ORIGIN_MISMATCH: 403,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INVALID_DURATION: 400,
  COOLDOWN_ACTIVE: 423,
  DEVICE_LIMIT: 403,
  DEVICE_MISSING: 403,
  ACTIVE_SESSION_EXISTS: 409,
  SESSION_EXPIRED: 410,
  NOT_COMPLETE: 422,
  SAVE_INVALID: 422,
  SAVE_CONFLICT: 409,
  HINT_LIMIT: 422,
};

export type ApiErrorBody = {
  code: ErrorCode;
  message: string;
  retryAfterSeconds?: number;
  cooldownUntil?: string | null;
  reason?: string | null;
  sessionId?: string;
  duration?: number;
  startedAt?: string;
  authoritativeExpiry?: string;
  status?: string;
  maxDevices?: number;
  revision?: number;
  state?: unknown;
  serverState?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extra: Omit<ApiErrorBody, "code" | "message">;

  constructor(code: ErrorCode, message: string, extra?: Omit<ApiErrorBody, "code" | "message">) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.extra = extra ?? {};
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function pgErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") {
    return "";
  }
  if ("code" in err && err.code != null) {
    return String(err.code);
  }
  if ("cause" in err) {
    return pgErrorCode(err.cause);
  }
  return "";
}
