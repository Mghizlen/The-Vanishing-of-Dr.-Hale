/**
 * Auth acceptance checks A1–A6 plus extras.
 * Usage: npx tsx scripts/test-auth.ts [baseUrl]
 * Never prints passwords, cookie values, or env values.
 */

import { randomBytes } from "node:crypto";

type CookieRecord = {
  name: string;
  value: string;
  httpOnly: boolean;
  path: string | null;
  sameSite: string | null;
  secure: boolean;
  maxAge: number | null;
};

type CheckResult = { name: string; ok: boolean; detail?: string };

const results: CheckResult[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name} — ${detail}`);
}

function parseSetCookie(header: string): CookieRecord | null {
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  const first = parts.shift();
  if (!first) {
    return null;
  }
  const eq = first.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1);
  const rec: CookieRecord = {
    name,
    value,
    httpOnly: false,
    path: null,
    sameSite: null,
    secure: false,
    maxAge: null,
  };
  for (const part of parts) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey.trim().toLowerCase();
    const val = rest.join("=").trim();
    if (key === "httponly") {
      rec.httpOnly = true;
    } else if (key === "secure") {
      rec.secure = true;
    } else if (key === "path") {
      rec.path = val;
    } else if (key === "samesite") {
      rec.sameSite = val.toLowerCase();
    } else if (key === "max-age") {
      const n = Number.parseInt(val, 10);
      rec.maxAge = Number.isFinite(n) ? n : null;
    }
  }
  return rec;
}

function cookieFlagsOk(
  cookie: CookieRecord | undefined,
  expectSecure: boolean,
): string | null {
  if (!cookie) {
    return "missing";
  }
  if (!cookie.httpOnly) {
    return "HttpOnly missing";
  }
  if (cookie.path !== "/") {
    return `Path is ${cookie.path ?? "(none)"}, expected /`;
  }
  if (cookie.sameSite !== "lax") {
    return `SameSite is ${cookie.sameSite ?? "(none)"}, expected Lax`;
  }
  if (cookie.secure !== expectSecure) {
    return expectSecure ? "Secure missing" : "Secure unexpectedly set";
  }
  return null;
}

function isCleared(cookie: CookieRecord | undefined): boolean {
  if (!cookie) {
    return false;
  }
  return cookie.value === "" || cookie.maxAge === 0;
}

function applySetCookies(jar: Map<string, string>, setCookies: string[]): Map<string, CookieRecord> {
  const parsed = new Map<string, CookieRecord>();
  for (const header of setCookies) {
    const rec = parseSetCookie(header);
    if (!rec) {
      continue;
    }
    parsed.set(rec.name, rec);
    if (isCleared(rec)) {
      jar.delete(rec.name);
    } else {
      jar.set(rec.name, rec.value);
    }
  }
  return parsed;
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(
  base: string,
  origin: string,
  jar: Map<string, string> | null,
  path: string,
  init: {
    method: string;
    body?: string;
    contentType?: string;
    origin?: string | null;
  },
): Promise<{ status: number; json: unknown; setCookies: Map<string, CookieRecord> }> {
  const headers = new Headers();
  if (init.origin !== null) {
    headers.set("Origin", init.origin ?? origin);
  }
  if (init.contentType) {
    headers.set("Content-Type", init.contentType);
  }
  if (jar) {
    const cookie = cookieHeader(jar);
    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }
  const res = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body,
    redirect: "manual",
  });
  const setCookies = applySetCookies(jar ?? new Map(), res.headers.getSetCookie());
  let json: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { parseError: true };
    }
  }
  return { status: res.status, json, setCookies };
}

function errorCode(json: unknown): string | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const err = (json as { error?: { code?: unknown } }).error;
  return typeof err?.code === "string" ? err.code : undefined;
}

function errorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const err = (json as { error?: { message?: unknown } }).error;
  return typeof err?.message === "string" ? err.message : undefined;
}

function dataUsername(json: unknown): string | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const data = (json as { data?: { username?: unknown } }).data;
  return typeof data?.username === "string" ? data.username : undefined;
}

async function main() {
  const baseArg = process.argv[2] ?? "http://localhost:3000";
  const base = baseArg.replace(/\/+$/, "");
  const origin = new URL(base).origin;
  const expectSecure = new URL(base).protocol === "https:";
  const suffix = randomBytes(6).toString("hex");
  const username = `hale_t_${suffix}`;
  const mixedUser = `Hale_t_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(12).toString("base64url");
  const jar = new Map<string, string>();

  // A1
  {
    const body = JSON.stringify({
      username,
      password,
      extra: "should-be-ignored",
    });
    const res = await request(base, origin, jar, "/api/auth/register", {
      method: "POST",
      body,
      contentType: "application/json",
    });
    const auth = res.setCookies.get("gd_auth");
    const device = res.setCookies.get("gd_device");
    const authFlags = cookieFlagsOk(auth, expectSecure);
    const deviceFlags = cookieFlagsOk(device, expectSecure);
    const stored = dataUsername(res.json);
    if (
      res.status === 200 &&
      !authFlags &&
      !deviceFlags &&
      stored === username &&
      jar.has("gd_auth") &&
      jar.has("gd_device")
    ) {
      pass("A1 register + cookie flags + extra fields ignored");
    } else {
      fail(
        "A1 register + cookie flags + extra fields ignored",
        `status=${res.status} code=${errorCode(res.json) ?? "none"} auth=${authFlags ?? "ok"} device=${deviceFlags ?? "ok"} usernameMatch=${stored === username}`,
      );
    }
  }

  // A2 logout
  {
    const res = await request(base, origin, jar, "/api/auth/logout", {
      method: "POST",
      body: "{}",
      contentType: "application/json",
    });
    const cleared = isCleared(res.setCookies.get("gd_auth"));
    if (res.status === 200 && cleared && !jar.has("gd_auth")) {
      pass("A2 logout clears gd_auth");
    } else {
      fail(
        "A2 logout clears gd_auth",
        `status=${res.status} clearedSetCookie=${cleared} stillInJar=${jar.has("gd_auth")}`,
      );
    }
  }

  // A2 login
  {
    const res = await request(base, origin, jar, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      contentType: "application/json",
    });
    const auth = res.setCookies.get("gd_auth");
    const flags = cookieFlagsOk(auth, expectSecure);
    if (res.status === 200 && !flags && jar.has("gd_auth")) {
      pass("A2 login sets gd_auth");
    } else {
      fail(
        "A2 login sets gd_auth",
        `status=${res.status} code=${errorCode(res.json) ?? "none"} flags=${flags ?? "ok"}`,
      );
    }
  }

  // A3
  {
    const wrong = await request(base, origin, new Map(), "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: `${password}x` }),
      contentType: "application/json",
    });
    const unknown = await request(base, origin, new Map(), "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: `hale_t_no_${suffix.slice(0, 8)}`, password }),
      contentType: "application/json",
    });
    const same =
      wrong.status === 401 &&
      unknown.status === 401 &&
      errorCode(wrong.json) === "INVALID_CREDENTIALS" &&
      errorCode(unknown.json) === "INVALID_CREDENTIALS" &&
      errorMessage(wrong.json) === errorMessage(unknown.json) &&
      typeof errorMessage(wrong.json) === "string";
    if (same) {
      pass("A3 identical INVALID_CREDENTIALS");
    } else {
      fail(
        "A3 identical INVALID_CREDENTIALS",
        `wrong=${wrong.status}/${errorCode(wrong.json)} unknown=${unknown.status}/${errorCode(unknown.json)} messagesEqual=${errorMessage(wrong.json) === errorMessage(unknown.json)}`,
      );
    }
  }

  // A4
  {
    const res = await request(base, origin, new Map(), "/api/auth/me", {
      method: "GET",
    });
    if (res.status === 401 && errorCode(res.json) === "UNAUTHENTICATED") {
      pass("A4 me without cookie");
    } else {
      fail("A4 me without cookie", `status=${res.status} code=${errorCode(res.json) ?? "none"}`);
    }
  }

  // A5 valid
  {
    const res = await request(base, origin, jar, "/api/auth/me", {
      method: "GET",
    });
    if (res.status === 200 && dataUsername(res.json) === username) {
      pass("A5 me with valid cookie");
    } else {
      fail(
        "A5 me with valid cookie",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // A5 tampered
  {
    const original = jar.get("gd_auth");
    if (!original || original.length < 2) {
      fail("A5 me with tampered cookie", "no gd_auth in jar to tamper");
    } else {
      const i = Math.floor(original.length / 2);
      const flipped = original[i] === "A" ? "B" : "A";
      const tampered = original.slice(0, i) + flipped + original.slice(i + 1);
      const tamperJar = new Map(jar);
      tamperJar.set("gd_auth", tampered);
      const res = await request(base, origin, tamperJar, "/api/auth/me", {
        method: "GET",
      });
      if (res.status === 401 && errorCode(res.json) === "UNAUTHENTICATED") {
        pass("A5 me with tampered cookie");
      } else {
        fail(
          "A5 me with tampered cookie",
          `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
        );
      }
    }
  }

  // A6
  {
    const res = await request(base, origin, new Map(), "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      contentType: "application/json",
    });
    if (res.status === 409 && errorCode(res.json) === "USERNAME_TAKEN") {
      pass("A6 duplicate register");
    } else {
      fail(
        "A6 duplicate register",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // Extra: Content-Type
  {
    const res = await request(base, origin, new Map(), "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: `hale_t_ct_${suffix}`, password }),
      contentType: "text/plain",
    });
    if (res.status === 400 && errorCode(res.json) === "VALIDATION_ERROR") {
      pass("extra Content-Type text/plain");
    } else {
      fail(
        "extra Content-Type text/plain",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // Extra: Origin
  {
    const res = await request(base, origin, new Map(), "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: `hale_t_orig_${suffix}`, password }),
      contentType: "application/json",
      origin: "http://evil.example",
    });
    if (res.status === 403 && errorCode(res.json) === "ORIGIN_MISMATCH") {
      pass("extra Origin mismatch");
    } else {
      fail(
        "extra Origin mismatch",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // Extra: lowercase storage
  {
    const expected = mixedUser.toLowerCase();
    const res = await request(base, origin, new Map(), "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: mixedUser, password }),
      contentType: "application/json",
    });
    if (res.status === 200 && dataUsername(res.json) === expected) {
      pass("extra uppercase username stored lowercase");
    } else {
      fail(
        "extra uppercase username stored lowercase",
        `status=${res.status} storedLower=${dataUsername(res.json) === expected}`,
      );
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`${failed === 0 ? "ALL PASS" : "SOME FAILED"}  ${results.length - failed}/${results.length}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "script failed");
  process.exit(1);
});
