import "server-only";

import { cookies } from "next/headers";

export const AUTH_COOKIE = "gd_auth";
export const DEVICE_COOKIE = "gd_device";

const AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    ...cookieBase(),
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, "", {
    ...cookieBase(),
    maxAge: 0,
  });
}

export async function setDeviceCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(DEVICE_COOKIE, token, {
    ...cookieBase(),
    maxAge: DEVICE_MAX_AGE_SECONDS,
  });
}

export async function readAuthCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

export async function readDeviceCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE)?.value;
}
