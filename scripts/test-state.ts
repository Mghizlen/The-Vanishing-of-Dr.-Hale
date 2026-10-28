/**
 * State acceptance checks. Never prints cookies, credentials, or environment values.
 * Usage: npx tsx scripts/test-state.ts [baseUrl]
 */
import { randomBytes } from "node:crypto";

type Json = {
  ok?: boolean;
  data?: {
    state?: Record<string, unknown>;
    revision?: number;
    hintCount?: number;
    hint?: string;
  };
  error?: { code?: string };
};
const results: string[] = [];
const pass = (name: string) => { results.push(`PASS  ${name}`); };
const fail = (name: string) => { results.push(`FAIL  ${name}`); };

async function main() {
  const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
  const jar = new Map<string, string>();
  const headers = (json = false) => {
    const h = new Headers({ Origin: new URL(base).origin });
    if (json) h.set("Content-Type", "application/json");
    if (jar.size) h.set("Cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "));
    return h;
  };
  const call = async (path: string, method: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, { method, headers: headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(";")[0];
      const index = first.indexOf("=");
      if (index > 0) jar.set(first.slice(0, index), first.slice(index + 1));
    }
    return { status: response.status, json: (await response.json()) as Json };
  };
  const suffix = randomBytes(6).toString("hex");
  const username = `state_${suffix}`;
  const password = randomBytes(12).toString("base64url");
  try {
    const registered = await call("/api/auth/register", "POST", { username, password });
    if (registered.status !== 200) throw new Error("register");
    const started = await call("/api/session/start", "POST", { duration: 10 });
    if (started.status !== 200) throw new Error("start");
    const initial = await call("/api/state", "GET");
    if (initial.status === 200 && initial.json.data?.revision === 0) pass("V1 initial state");
    else fail("V1 initial state");
    const state = initial.json.data?.state;
    const revision = initial.json.data?.revision;
    const saved = await call("/api/state", "PUT", { revision, state: { ...state, inspectedObjects: ["obj_desk_calendar"] } });
    if (saved.status === 200 && saved.json.data?.revision === 1) pass("V2 valid save increments revision");
    else fail("V2 valid save increments revision");
    const conflict = await call("/api/state", "PUT", { revision: 0, state });
    if (conflict.status === 409 && conflict.json.error?.code === "SAVE_CONFLICT") pass("V3 stale revision conflict");
    else fail("V3 stale revision conflict");
    const tampered = await call("/api/state", "PUT", { revision: 1, state: { ...saved.json.data?.state, hintCount: 1 } });
    if (tampered.status === 422 && tampered.json.error?.code === "SAVE_INVALID") pass("V4 hintCount tamper rejected");
    else fail("V4 hintCount tamper rejected");
    const hint = await call("/api/hint", "POST", { puzzleId: "puz_drawer_code" });
    if (hint.status === 200 && hint.json.data?.hintCount === 1) pass("V5 hint increments server state");
    else fail("V5 hint increments server state");
    const afterHint = await call("/api/state", "GET");
    if (afterHint.json.data?.state?.hintCount === 1 && afterHint.json.data?.revision === 2) pass("V6 hint revision persisted");
    else fail("V6 hint revision persisted");
  } catch {
    fail("state harness");
  }
  for (const result of results) console.log(result);
  console.log(results.every((result) => result.startsWith("PASS")) ? `ALL PASS  ${results.length}/${results.length}` : `FAILURES  ${results.filter((result) => result.startsWith("PASS")).length}/${results.length}`);
  if (results.some((result) => result.startsWith("FAIL"))) process.exitCode = 1;
}

void main();
