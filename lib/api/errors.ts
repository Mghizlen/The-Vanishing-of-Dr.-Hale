import "server-only";

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USERNAME_TAKEN: "USERNAME_TAKEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ORIGIN_MISMATCH: "ORIGIN_MISMATCH",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
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
};

export type ApiErrorBody = {
  code: ErrorCode;
  message: string;
  retryAfterSeconds?: number;
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
