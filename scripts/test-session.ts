/**
 * Session / device checks S1–S3, S4–S9, S11, complete paths, D1, D3, D5, DEVICE_MISSING.
 * Usage: npx tsx scripts/test-session.ts [baseUrl]
 * Never prints passwords, cookie values, hashes, MAX_DEVICES, or env values.
 */

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

loadEnv({ path: ".env.local" });

type CookieRecord = {
  name: string;
  value: string;
  httpOnly: boolean;
  path: string | null;
  sameSite: string | null;
  secure: boolean;
  maxAge: number | null;
};

const results: { name: string; ok: boolean }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false });
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
  const rec: CookieRecord = {
    name: first.slice(0, eq).trim(),
    value: first.slice(eq + 1),
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
    if (key === "httponly") rec.httpOnly = true;
    else if (key === "secure") rec.secure = true;
    else if (key === "path") rec.path = val;
    else if (key === "samesite") rec.sameSite = val.toLowerCase();
    else if (key === "max-age") {
      const n = Number.parseInt(val, 10);
      rec.maxAge = Number.isFinite(n) ? n : null;
    }
  }
  return rec;
}

function isCleared(cookie: CookieRecord | undefined): boolean {
  if (!cookie) return false;
  return cookie.value === "" || cookie.maxAge === 0;
}

function applySetCookies(jar: Map<string, string>, setCookies: string[]) {
  for (const header of setCookies) {
    const rec = parseSetCookie(header);
    if (!rec) continue;
    if (isCleared(rec)) jar.delete(rec.name);
    else jar.set(rec.name, rec.value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function errorCode(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const err = (json as { error?: { code?: unknown } }).error;
  return typeof err?.code === "string" ? err.code : undefined;
}

function dataField(json: unknown): Record<string, unknown> | undefined {
  if (!json || typeof json !== "object") return undefined;
  const data = (json as { data?: unknown }).data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

async function request(
  base: string,
  origin: string,
  jar: Map<string, string> | null,
  path: string,
  init: { method: string; body?: string; contentType?: string },
): Promise<{ status: number; json: unknown }> {
  const headers = new Headers();
  headers.set("Origin", origin);
  if (init.contentType) {
    headers.set("Content-Type", init.contentType);
  }
  if (jar) {
    const cookie = cookieHeader(jar);
    if (cookie) headers.set("Cookie", cookie);
  }
  const res = await fetch(`${base}${path}`, {
    method: init.method,
    headers,
    body: init.body,
    redirect: "manual",
  });
  applySetCookies(jar ?? new Map(), res.headers.getSetCookie());
  let json: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { parseError: true };
    }
  }
  return { status: res.status, json };
}

async function register(
  base: string,
  origin: string,
  jar: Map<string, string>,
  username: string,
  password: string,
) {
  return request(base, origin, jar, "/api/auth/register", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({ username, password }),
  });
}

async function login(
  base: string,
  origin: string,
  jar: Map<string, string>,
  username: string,
  password: string,
) {
  return request(base, origin, jar, "/api/auth/login", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({ username, password }),
  });
}

async function start(
  base: string,
  origin: string,
  jar: Map<string, string>,
  body: Record<string, unknown>,
) {
  return request(base, origin, jar, "/api/session/start", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function seed(command: string, username: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "scripts/seed-and-reset.ts", command, username],
      { cwd: process.cwd(), shell: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("seed command failed"));
    });
  });
}

function durationDeltaSeconds(startedAt: unknown, expiry: unknown): number | null {
  if (typeof startedAt !== "string" || typeof expiry !== "string") return null;
  const a = Date.parse(startedAt);
  const b = Date.parse(expiry);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 1000);
}

async function hashesAreSha256Hex(username: string): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL_DIRECT;
  if (!connectionString) {
    throw new Error("DATABASE_URL_DIRECT is not set");
  }
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const users = await pool.query<{ id: string }>(
      "select id from users where username = $1",
      [username],
    );
    const id = users.rows[0]?.id;
    if (!id) return false;
    const hashes = await pool.query<{ token_hash: string }>(
      "select token_hash from devices where user_id = $1",
      [id],
    );
    if (hashes.rowCount === 0) return false;
    return hashes.rows.every((row) => /^[0-9a-f]{64}$/i.test(row.token_hash));
  } finally {
    await pool.end();
  }
}

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
  const origin = new URL(base).origin;
  const suffix = randomBytes(4).toString("hex");
  const password = randomBytes(12).toString("base64url");
  const userA = `hale_s_a_${suffix}`;
  const userB = `hale_s_b_${suffix}`;
  const userC = `hale_s_c_${suffix}`;
  const userD = `hale_s_d_${suffix}`;
  const userE = `hale_s_e_${suffix}`;
  const userF = `hale_s_f_${suffix}`;

  const jarA = new Map<string, string>();
  const regA = await register(base, origin, jarA, userA, password);
  if (regA.status !== 200) {
    fail("setup register A", `status=${regA.status} code=${errorCode(regA.json) ?? "none"}`);
    process.exit(1);
  }

  // S1 — five durations (reset between)
  {
    const minutes = [10, 15, 30, 60, 90] as const;
    let allOk = true;
    let detail = "";
    for (const m of minutes) {
      const res = await start(base, origin, jarA, { duration: m });
      const data = dataField(res.json);
      const delta = durationDeltaSeconds(data?.startedAt, data?.authoritativeExpiry);
      if (res.status !== 200 || data?.duration !== m || delta !== m * 60) {
        allOk = false;
        detail = `m=${m} status=${res.status} duration=${String(data?.duration)} delta=${String(delta)}`;
        break;
      }
      await seed("end-session", userA);
      await seed("clear-cooldown", userA);
    }
    if (allOk) pass("S1 start five levels exact duration");
    else fail("S1 start five levels exact duration", detail);
  }

  // S2
  {
    const cases: unknown[] = [20, 0, -5, "abc", undefined];
    let allOk = true;
    let detail = "";
    for (const duration of cases) {
      const body =
        duration === undefined ? {} : { duration };
      const res = await start(base, origin, jarA, body as Record<string, unknown>);
      if (res.status !== 400 || errorCode(res.json) !== "INVALID_DURATION") {
        allOk = false;
        detail = `input=${String(duration)} status=${res.status} code=${errorCode(res.json) ?? "none"}`;
        break;
      }
    }
    if (allOk) pass("S2 invalid durations");
    else fail("S2 invalid durations", detail);
  }

  // S3 concurrent
  {
    const [r1, r2] = await Promise.all([
      start(base, origin, jarA, { duration: 10 }),
      start(base, origin, jarA, { duration: 10 }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    const codes = [errorCode(r1.json), errorCode(r2.json)];
    const ok200 = statuses[0] === 200 && statuses[1] === 409;
    const conflict = r1.status === 409 ? r1.json : r2.json;
    const extra = (conflict as { error?: Record<string, unknown> })?.error;
    const hasFields =
      extra &&
      typeof extra.sessionId === "string" &&
      typeof extra.duration === "number" &&
      typeof extra.startedAt === "string" &&
      typeof extra.authoritativeExpiry === "string" &&
      extra.status === "active";
    if (ok200 && codes.includes("ACTIVE_SESSION_EXISTS") && hasFields) {
      pass("S3 concurrent start");
    } else {
      fail(
        "S3 concurrent start",
        `statuses=${r1.status}/${r2.status} hasFields=${Boolean(hasFields)}`,
      );
    }
  }

  // S9 forged fields (session from S3 still active — abandon first)
  {
    await seed("end-session", userA);
    await seed("clear-cooldown", userA);
    const res = await start(base, origin, jarA, {
      duration: 10,
      expiresAt: "1999-01-01T00:00:00.000Z",
      cooldownUntil: "1999-01-01T00:00:00.000Z",
    });
    const data = dataField(res.json);
    const delta = durationDeltaSeconds(data?.startedAt, data?.authoritativeExpiry);
    if (res.status === 200 && delta === 600) {
      pass("S9 extra body fields ignored");
    } else {
      fail("S9 extra body fields ignored", `status=${res.status} delta=${String(delta)}`);
    }
  }

  // S8 abandon
  {
    const res = await request(base, origin, jarA, "/api/session/abandon", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    const status = await request(base, origin, jarA, "/api/session/status", {
      method: "GET",
    });
    const data = dataField(status.json);
    if (
      res.status === 200 &&
      status.status === 200 &&
      data?.state === "cooldown" &&
      data?.reason === "abandoned"
    ) {
      pass("S8 abandon applies cooldown");
    } else {
      fail(
        "S8 abandon applies cooldown",
        `abandon=${res.status} state=${String(data?.state)} reason=${String(data?.reason)}`,
      );
    }
  }

  // S4 / S11 expire via seed then status
  {
    await seed("clear-cooldown", userA);
    const started = await start(base, origin, jarA, { duration: 10 });
    await seed("expire-session", userA);
    const status = await request(base, origin, jarA, "/api/session/status", {
      method: "GET",
    });
    const data = dataField(status.json);
    if (
      started.status === 200 &&
      status.status === 200 &&
      data?.state === "cooldown" &&
      data?.reason === "expired" &&
      typeof data?.cooldownUntil === "string"
    ) {
      pass("S4/S11 lazy expire via status");
    } else {
      fail(
        "S4/S11 lazy expire via status",
        `start=${started.status} state=${String(data?.state)} reason=${String(data?.reason)}`,
      );
    }
  }

  // S5 start while locked
  {
    const res = await start(base, origin, jarA, { duration: 10 });
    const extra = (res.json as { error?: { cooldownUntil?: unknown } })?.error;
    if (
      res.status === 423 &&
      errorCode(res.json) === "COOLDOWN_ACTIVE" &&
      typeof extra?.cooldownUntil === "string"
    ) {
      pass("S5 start during cooldown");
    } else {
      fail("S5 start during cooldown", `status=${res.status} code=${errorCode(res.json) ?? "none"}`);
    }
  }

  // S6 logout/login and second jar still locked
  {
    await request(base, origin, jarA, "/api/auth/logout", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    const again = await login(base, origin, jarA, userA, password);
    const startAgain = await start(base, origin, jarA, { duration: 10 });
    const jarOther = new Map<string, string>();
    const otherLogin = await login(base, origin, jarOther, userA, password);
    const otherStart = await start(base, origin, jarOther, { duration: 10 });
    if (
      again.status === 200 &&
      startAgain.status === 423 &&
      otherLogin.status === 200 &&
      otherStart.status === 423
    ) {
      pass("S6 cooldown account-wide");
    } else {
      fail(
        "S6 cooldown account-wide",
        `login=${again.status} start=${startAgain.status} otherStart=${otherStart.status}`,
      );
    }
  }

  // S7 clear-cooldown then start
  {
    await seed("clear-cooldown", userA);
    const res = await start(base, origin, jarA, { duration: 10 });
    if (res.status === 200) pass("S7 start after clear-cooldown");
    else fail("S7 start after clear-cooldown", `status=${res.status} code=${errorCode(res.json) ?? "none"}`);
    await seed("end-session", userA);
    await seed("clear-cooldown", userA);
  }

  // complete 422
  {
    const jar = new Map<string, string>();
    await register(base, origin, jar, userB, password);
    await start(base, origin, jar, { duration: 10 });
    const res = await request(base, origin, jar, "/api/session/complete", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    if (res.status === 422 && errorCode(res.json) === "NOT_COMPLETE") {
      pass("complete NOT_COMPLETE on fresh save");
    } else {
      fail(
        "complete NOT_COMPLETE on fresh save",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // complete success + score
  {
    const jar = new Map<string, string>();
    await register(base, origin, jar, userC, password);
    await start(base, origin, jar, { duration: 10 });
    await seed("set-solved", userC);
    const res = await request(base, origin, jar, "/api/session/complete", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    const data = dataField(res.json);
    const score = data?.score;
    if (res.status === 200 && typeof score === "number" && score >= 200) {
      pass("complete success computes score");
    } else {
      fail(
        "complete success computes score",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // expired then complete 410
  {
    const jar = new Map<string, string>();
    await register(base, origin, jar, userD, password);
    await start(base, origin, jar, { duration: 10 });
    await seed("set-solved", userD);
    await seed("expire-session", userD);
    const res = await request(base, origin, jar, "/api/session/complete", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    if (res.status === 410 && errorCode(res.json) === "SESSION_EXPIRED") {
      pass("complete after expiry is SESSION_EXPIRED");
    } else {
      fail(
        "complete after expiry is SESSION_EXPIRED",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  // DEVICE_MISSING
  {
    const jar = new Map<string, string>();
    await register(base, origin, jar, userE, password);
    jar.delete("gd_device");
    const missing = await start(base, origin, jar, { duration: 10 });
    const hasDevice = jar.has("gd_device");
    const retry = await start(base, origin, jar, { duration: 10 });
    if (
      missing.status === 403 &&
      errorCode(missing.json) === "DEVICE_MISSING" &&
      hasDevice &&
      retry.status === 200
    ) {
      pass("DEVICE_MISSING mints cookie then retry starts");
    } else {
      fail(
        "DEVICE_MISSING mints cookie then retry starts",
        `missing=${missing.status} retry=${retry.status} cookieSet=${hasDevice}`,
      );
    }
  }

  // D1 hex hashes
  {
    try {
      const ok = await hashesAreSha256Hex(userA) && await hashesAreSha256Hex(userE);
      if (ok) pass("D1 device hashes are sha256 hex");
      else fail("D1 device hashes are sha256 hex", "unexpected hash format or missing rows");
    } catch {
      fail("D1 device hashes are sha256 hex", "query failed");
    }
  }

  // D5 garbage device cookie under limit
  {
    const jar = new Map<string, string>();
    await register(base, origin, jar, userF, password);
    jar.set("gd_device", "garbage-device-token");
    const res = await start(base, origin, jar, { duration: 10 });
    let hashesOk = false;
    try {
      hashesOk = await hashesAreSha256Hex(userF);
    } catch {
      hashesOk = false;
    }
    if (res.status === 200 && hashesOk) {
      pass("D5 garbage device cookie treated as unknown");
    } else {
      fail("D5 garbage device cookie treated as unknown", `status=${res.status}`);
    }
  }

  // D3 exceed device limit
  {
    const user = `hale_s_g_${suffix}`;
    const jars: Map<string, string>[] = [];
    const first = new Map<string, string>();
    await register(base, origin, first, user, password);
    jars.push(first);
    let hitLimit = false;
    for (let i = 0; i < 6; i += 1) {
      const jar = new Map<string, string>();
      const logged = await login(base, origin, jar, user, password);
      if (logged.status !== 200) break;
      const res = await start(base, origin, jar, { duration: 10 });
      if (res.status === 403 && errorCode(res.json) === "DEVICE_LIMIT") {
        hitLimit = true;
        break;
      }
      if (res.status === 200 || res.status === 409) {
        await seed("end-session", user);
        await seed("clear-cooldown", user);
      }
    }
    if (hitLimit) pass("D3 DEVICE_LIMIT when extra device starts");
    else fail("D3 DEVICE_LIMIT when extra device starts", "did not observe DEVICE_LIMIT");
  }

  // /me active session summary after a known start
  {
    await seed("end-session", userA);
    await seed("clear-cooldown", userA);
    await start(base, origin, jarA, { duration: 15 });
    const me = await request(base, origin, jarA, "/api/auth/me", { method: "GET" });
    const data = dataField(me.json);
    const session = data?.activeSession as Record<string, unknown> | null | undefined;
    if (me.status === 200 && session && session.duration === 15 && session.status === "active") {
      pass("GET /me returns active session summary");
    } else {
      fail("GET /me returns active session summary", `status=${me.status}`);
    }
  }

  // abandon with no session
  {
    await seed("end-session", userA);
    await seed("clear-cooldown", userA);
    const res = await request(base, origin, jarA, "/api/session/abandon", {
      method: "POST",
      contentType: "application/json",
      body: "{}",
    });
    if (res.status === 400 && errorCode(res.json) === "VALIDATION_ERROR") {
      pass("abandon without session is VALIDATION_ERROR");
    } else {
      fail(
        "abandon without session is VALIDATION_ERROR",
        `status=${res.status} code=${errorCode(res.json) ?? "none"}`,
      );
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`${failed === 0 ? "ALL PASS" : "SOME FAILED"}  ${results.length - failed}/${results.length}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "script failed");
  process.exit(1);
});
