import "server-only";

import { SignJWT, jwtVerify } from "jose";

const AUTH_TTL = "7d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT configuration is invalid");
  }
  return new TextEncoder().encode(secret);
}

function getIssuer(): string {
  const issuer = process.env.JWT_ISSUER;
  if (!issuer) {
    throw new Error("JWT configuration is invalid");
  }
  return issuer;
}

function getAudience(): string {
  const audience = process.env.JWT_AUDIENCE;
  if (!audience) {
    throw new Error("JWT configuration is invalid");
  }
  return audience;
}

export async function signAuthToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(AUTH_TTL)
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: getIssuer(),
    audience: getAudience(),
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("JWT subject is missing");
  }

  return { userId: payload.sub };
}
