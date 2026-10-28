import "server-only";

import { z } from "zod";

import { ApiError, ErrorCode } from "@/lib/api/errors";

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/),
  password: z.string().min(8),
});

export type Credentials = z.output<typeof credentialsSchema>;

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, "Invalid request.");
  }
}

export function parseCredentials(body: unknown): Credentials {
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, "Invalid request.");
  }
  return parsed.data;
}
