Role: Senior Full-Stack Game Developer & Systems Architect.
Task: Generate a single, comprehensive INSTRUCTIONS.md specifications document to build, deploy, and host a 2D illustrated mystery/puzzle game for a university presentation tomorrow.

Stack Requirements:
- Framework: Next.js 14+ (App Router, TypeScript, Server Actions/API Routes).
- Styling & UI: Tailwind CSS, Lucide Icons, Framer Motion.
- Database & ORM: Neon Serverless Postgres with Drizzle ORM.
- Auth & Security: Jose (JWT) with HttpOnly secure cookies.
- Hosting: Vercel (Hobby Tier).

Game Logic & Rules:
1. Five Duration-Based Difficulty Levels:
   - 10 minutes: Quick Demo / Onboarding (Idea preview mode).
   - 15 minutes: Detective.
   - 30 minutes: Investigator.
   - 60 minutes: Master Detective.
   - 90 minutes: Expert.

2. Server-Authoritative Session & Cooldown System:
   - Server strictly determines start time, expiry timestamp, and cooldown status.
   - Session Start Validation Sequence: Verify Auth -> Check valid duration -> Check account cooldown -> Validate device binding -> Atomically insert session -> Return expiry timestamp.
   - Cooldown Enforcement: If session expires or backend fails validation, lock new sessions with explicit error UI (no silent fallbacks).

3. Device Restriction & Privacy:
   - Issue server-side random device token stored in HttpOnly cookie.
   - Server stores only SHA-256 hash of device token.
   - Document device limitations (cookie deletion, multi-browser handling) while using account-wide server locks as primary defense.

4. Versioned Save/Resume State:
   - Schema version 1.0 JSON format tracking: currentStage, inventory (array), inspectedObjects (set/array), solvedPuzzles (array), duration, hintCount, sessionId, authoritativeExpiry.
   - Sync progress to Neon Postgres server-side to allow cross-device resume.
   - Server expiry/cooldown overrides any client-modified local state.

Deliverable Structure:
Provide a clear, copy-pasteable INSTRUCTIONS.md with Architecture Diagram, Database Schema, Core Backend API/Actions, Frontend State Machine, Vercel Deployment Guide, and Acceptance Test Suite.
don't provide code just instruction and i will code alone i don't have previous code i only have a empty folder
I've written `INSTRUCTIONS.md` as a spec with no application code. The only commands it mentions are setup and deployment steps. It covers the architecture diagram, database schema, backend API, frontend state machine, Vercel deployment guide and acceptance tests you asked for. It adds a 24-hour build order, a game content outline and an 8-minute demo script.

A few decisions I made that you should know about:

- **Neon driver:** the HTTP driver can't run the transaction the session-start sequence needs, so the doc has you use the WebSocket (pooled) driver for that path.
- **Atomic session start:** a partial unique index on active sessions makes concurrent start requests safe at the database level, not just in app code.
- **Expiry without cron:** Vercel Hobby only allows daily cron jobs, so expiry is checked lazily on every request instead.
- **Device limit vs. cross-device resume:** these conflict, so I set a configurable `MAX_DEVICES` per account (2 for the final version, 3 while you rehearse). The account-wide cooldown is the real defence, and the device table is documented as friction only, with an honest limitations table.
- **Cooldown values:** I invented them (2 minutes for the demo level, then 30, 60, 120 and 180 minutes). They are config values, so change them freely. The short demo cooldown lets you show the lock screen live.
- **Next.js version:** I suggested the latest 15.x because older 14.x releases had a middleware auth-bypass bug, and the doc says never to rely on middleware alone for auth.
- **Story and puzzles:** I made up a small case ("The Vanishing of Dr. Hale") with six puzzles so the five levels share one set of content. Replace it if you have your own idea.

Deploy to Vercel by about the 10-hour mark, as the build order says. Env-var and cookie problems are much easier to fix with time to spare.

Files are in /mnt/user-data/outputs:
- INSTRUCTIONS.md
Ok, if I provide this MD to Cursor, what i should tell him so I can get the perfect result
# Using INSTRUCTIONS.md with Cursor

## Setup (2 minutes)

1. Put `INSTRUCTIONS.md` in the root of your empty folder and open the folder in Cursor.
2. Create `.cursor/rules/project.mdc` and set it to **Always apply**. Paste in the short rules block below, so Cursor never forgets the constraints in a long chat.
3. Use **Agent mode** and reference the file with `@INSTRUCTIONS.md` in every prompt.
4. Run `git init` first. Commit after every phase so you can roll back when Cursor breaks something.

### Rules block for `.cursor/rules/project.mdc`

```
You are building the project specified in @INSTRUCTIONS.md. That file is the single source of truth.

Hard rules:
- Never change decisions in INSTRUCTIONS.md (stack, schema, API order, error codes, save format). If something seems wrong or impossible, STOP and ask me before deviating.
- The server database clock is the only authoritative time. Never use client time for any decision.
- Fail closed: no silent fallbacks, no offline sessions, no swallowed errors.
- Never store raw device tokens, never log secrets/cookies/passwords.
- Use the Node runtime for API routes. Use the Neon WebSocket pool driver for any transaction.
- Never rely on middleware alone for auth. Every route re-verifies.
- Next.js 15: cookies() and headers() are async. Check current docs for Drizzle, Neon, jose, and Next before using any API; do not guess signatures.
- Work on ONE phase at a time. When finished, list what you did, what you did not do, and how to verify it. Do not start the next phase.
- TypeScript strict mode, no `any`, validate all inputs with zod.
```

## Master prompt (first message)

```
Read @INSTRUCTIONS.md completely before doing anything.

Then:
1. Summarize back to me, in under 15 bullets, the architecture, the session-start validation sequence, and the cooldown/device rules, so I can confirm you understood.
2. List any ambiguities, risks, or version problems you see in the spec (for example library API changes). Do not fix them yet, just list them.
3. Propose the exact folder structure and package list you will use.

Do NOT write any code yet. Wait for my approval.
```

This forces Cursor to prove it understood the spec before it writes anything, which is the best way to prevent the plausible-but-wrong code that comes from a skimmed document.

## Phase prompts (send one at a time)

Use this template for each phase:

```
Implement ONLY Phase [X] from Section 11 of @INSTRUCTIONS.md.
Relevant sections: [list].
Rules: follow the spec exactly; do not add features; do not touch files outside this phase unless required.
When done: 
1. Tell me how to run it and verify it.
2. Map your work to the acceptance tests [IDs] and tell me which you could verify and which I must test manually.
3. List anything you deviated from or were unsure about.
```

Fill in the phases like this:

| Phase | Sections to cite | Tests to verify |
|---|---|---|
| A. Setup | 2, 9, 10 | App runs |
| B. Database | 4, 2.1 | Index exists in Neon |
| C. Auth | 5.2, 7.1 | A1 to A6 |
| D. Guards and session API | 5.1, 5.3, 5.4, 5.6 | S1 to S11, D1 to D5 |
| E. Save API | 6, 5.5 | V1 to V10, C1 to C3 |
| G. Frontend shell | 8, 5.6 | U1 to U6 |
| H. Game content | 1.2, 9 | Demo level playable |

For phases D and E, add:

```
Before writing code, write out the numbered steps of the transaction in plain English and wait for my OK. Then implement. Afterwards, write automated tests (or a script) for the cooldown, concurrent-start, and tamper cases.
```

## After each phase

- **Review the security-critical files yourself:** the JWT and cookie code, the session-start transaction, the save validation, and the device hashing. Cursor tends to get these subtly wrong, such as a missing await on `cookies()`, a non-atomic start, or trusting a client field.
- **Run the acceptance tests yourself.** Don't accept "all tests pass" from Cursor.
- **Commit.** If the next phase goes wrong, you can revert.

## Prompts for common problems

**Cursor drifts from the spec:**
```
You deviated from @INSTRUCTIONS.md section [X]. Re-read it and fix your implementation to match exactly. Do not change the spec.
```

**Cursor invents an API:**
```
Verify this against the current official docs for [library/version] before continuing. Show me the doc reference you used.
```

**A bug you can't find:**
```
Here is the exact error and the steps that cause it: [paste]. First explain the root cause in plain English, then propose the smallest fix. Do not refactor anything else.
```

**Final audit, before presentation:**
```
Audit the whole codebase against @INSTRUCTIONS.md. For each Critical acceptance test (Section 12), tell me which code enforces it and point to the file and function. Flag any place where the client can influence time, cooldown, session id, or hint count.
```

## Tips for the best results

- **Keep chats short:** start a new chat for each phase and re-attach `@INSTRUCTIONS.md`. Long chats make Cursor forget details.
- **Use docs lookup:** add the Next.js, Drizzle, Neon and jose docs to Cursor's `@Docs`, or use a docs MCP, so it stops guessing at APIs.
- **Don't ask for everything at once:** "build the whole game" gives you a shallow result. Phase by phase gives a working core.
- **Generate the art separately:** have Cursor use placeholder rectangles first, then swap in real illustrations at the end.
- **Cut scope under time pressure:** if time runs short, simplify the puzzle logic and keep the server session system intact.
the .cursor/rules/project.mdc, I can't apply it; it always applies. I'm on a free account

Rules work on the free plan, so the problem is probably just how the file is set up. Try these in order and stop at the first one that works.

## Option 1: Write the frontmatter yourself (no UI needed)

Cursor reads the "Always apply" setting from the top of the `.mdc` file, so you can type it directly. Make `.cursor/rules/project.mdc` start with these lines, then your rules block below them:

```
---
description: Project rules for the mystery game
alwaysApply: true
---
```

Save the file, then open Cursor Settings and the Rules section to check it is listed as active.

## Option 2: Use `AGENTS.md` (simplest)

Create a plain file called `AGENTS.md` in the project root and paste the rules block into it, with no frontmatter. Cursor picks it up automatically. It works the same as a rule that is always on, and there is nothing to configure.

## Option 3: Use `.cursorrules` (legacy)

Create a file named `.cursorrules` in the root and paste the rules block in. This is the older format. Some versions of Cursor still read it, but it is deprecated, so try Option 2 first.

## Option 4: Skip rule files entirely

If none of the above work, paste the rules block at the top of every phase prompt, followed by the phase template. It is more typing but it always works. Keep the block short so it doesn't eat your usage.

## Free plan tips

- **Don't rely on Cursor to enforce rules for you.** Check yourself that the first reply to the master prompt shows it understood the spec. If it doesn't mention the transaction or cooldown rules, the rules or the file aren't being read.
- **Agent requests are limited on the free plan.** Don't waste them on the "summarize back" step for every phase. Do it once, then use the phase template.
- **If you run out of requests**, you can paste sections of `INSTRUCTIONS.md` and the phase prompt into any other chat assistant and copy the code back, using the same phase-by-phase flow.

If it still doesn't work, tell me what you see (the file listed or not, and any error message) and I'll help you sort it out.

i config everything and send him this prompt 
Read @INSTRUCTIONS.md completely before doing anything.

Then:
1. Summarize back to me, in under 15 bullets, the architecture, the session-start validation sequence, and the cooldown/device rules, so I can confirm you understood.
2. List any ambiguities, risks, or version problems you see in the spec (for example library API changes). Do not fix them yet, just list them.
3. Propose the exact folder structure and package list you will use.

Do NOT write any code yet. Wait for my approval.
and this is the responce 
look for the pasted text
Read **INSTRUCTIONS.md** end to end. Below is the confirmation summary, risks/ambiguities, and a concrete plan—no code until you approve.

---

## 1. Summary (architecture, session start, cooldown & devices)

**Architecture**
- Browser: Next.js client (scenes, inventory/puzzles, display-only countdown + frontend state machine); HttpOnly cookies `gd_auth` (JWT) and `gd_device` (raw token never in JS).
- Vercel: Node runtime route handlers/actions for auth, device, session, state, hints; shared guards on every protected path (not middleware-only).
- Neon Postgres via Drizzle: `users`, `devices`, `game_sessions`, `save_states`, optional `audit_events`; **pooled WebSocket driver** for transactional writes.
- **Postgres `now()`** is the only authoritative clock; client gets `serverNow` + `authoritativeExpiry` and only displays a skew-adjusted countdown, re-syncing at 0 and ~every 30s.
- **Fail closed**, **lazy expiry** on session-touching requests (no cron dependency), **one active session per user** via partial unique index, client/save tampering overwritten or rejected.

**Session start validation (strict order, stop on first failure)**
1. `verifyAuth` → 401  
2. Valid duration (10/15/30/60/90 only, level derived server-side) → 400  
3. In one DB transaction (user row `FOR UPDATE`): `lazyExpire` then `enforceCooldown` → 423  
4. `verifyDevice` → 403 (`DEVICE_LIMIT` / `DEVICE_MISSING`)  
5. Insert `game_sessions` + initial `save_states` (DB-computed `started_at` / `expires_at`; unique index race → 409 `ACTIVE_SESSION_EXISTS`)  
6. Success payload with session metadata + `initialState`; unexpected errors in 3–6 → 503, no play.

**Cooldown & device rules**
- Cooldown is **account-wide** on `users.cooldown_until` (reason: expired, abandoned, completed, optional integrity_violation); per-level durations live in **one config file**, demo overridable via `DEMO_COOLDOWN_SECONDS`.
- Expired active sessions flip to `expired` in `lazyExpire` and set cooldown in the **same transaction**; abandon and complete also apply the level cooldown (no loopholes).
- Device: 32-byte token in `gd_device`; DB stores **SHA-256 hex** only; register on first use if under `MAX_DEVICES` (2 prod / 3 rehearsal); enforced on **start** and **state writes**; cooldown cannot be skipped by new browser/cookie—only account lock matters for cheating the timer.
- Logout does **not** clear cooldown or end session; cross-device **resume** via status + GET state keeps the **same expiry**.

---

## 2. Ambiguities, risks, and version problems (not fixing yet)

| Area | Issue |
|------|--------|
| **Duration vs level keys** | Table uses `demo`/`detective`/…; start body is minutes only. Mapping is implied (10→demo, etc.) but not spelled out in §5.3. |
| **Transaction boundary** | Steps 3–6 must share one transaction; `verifyDevice` may insert/update `devices`—must not run outside that transaction or ordering vs cooldown could race. |
| **GET `/api/state` vs device guard** | Copy says resume from any **registered** device; PUT lists `verifyDevice`. Unclear if GET requires a registered device hash or only auth + active session. |
| **`DEVICE_MISSING`** | Listed for session start; if JWT cookie works but `gd_device` cannot be set/read, exact guard behavior vs `ensureDeviceToken` is unspecified. |
| **Hint counter authority** | §6.2/6.3 require `hintCount` match “server counter” while hints mutate `save_states`—need a single rule (likely: DB JSON is source after hint API only). |
| **Scoring** | Marked [LATER] in §1.3 but **C1 Critical** requires server score on completion—scoring is effectively mandatory for acceptance. |
| **Rate limiting** | Login limit “via `audit_events`” with no dedicated table/window semantics—implementation choices affect correctness under concurrency. |
| **Tamper → invalidate** | Optional session invalidate + `integrity_violation` cooldown—threshold “repeated” undefined. |
| **Next.js version (Oct 2026)** | Spec pins **15.x**; `create-next-app` may default to **16+**—pin explicitly or document deviation. |
| **Async request APIs** | Next 15: `cookies()` / `headers()` async—easy to miss in guards; edge vs `nodejs` runtime—bcrypt/jose/DB must stay on **nodejs** (§2.2, §13.5). |
| **Neon + Drizzle** | HTTP driver must **not** be used for start/save/end; need Pool + `ws` (or equivalent) on Vercel; cold/suspend latency called out for demos. |
| **Drizzle partial unique index** | Must be expressible in schema/migration and verified in Neon SQL editor (§4.3, §13.2)—syntax/generation footgun. |
| **CSRF** | `APP_ORIGIN` + `Origin` check on mutating requests—preview deployments vs production origin need a clear rule. |
| **Concurrent start loser** | 409 must include existing session summary—shape not fully specified. |
| **Save monotonicity** | Requires prior server state to detect removed puzzles/objects—first save vs revision 0 behavior should be explicit. |
| **Forged start fields (S9)** | Body may only expose `duration`; extra fields ignored by design—document in handler. |
| **Cookie `Secure` on localhost** | Env-based relax—must match Vercel HTTPS vs local dev or login chain breaks (§13.5). |

---

## 3. Proposed folder structure and packages

**Folder structure** (aligned with §9, expanded for App Router + Drizzle):

```
The Vanishing of Dr. Hale/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # redirect or boot entry
│   ├── globals.css
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (game)/
│   │   ├── lobby/page.tsx
│   │   └── play/page.tsx
│   └── api/
│       ├── auth/
│       │   ├── register/route.ts
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   └── me/route.ts
│       ├── session/
│       │   ├── start/route.ts
│       │   ├── status/route.ts
│       │   ├── abandon/route.ts
│       │   └── complete/route.ts
│       ├── state/route.ts          # GET + PUT
│       └── hint/route.ts
├── components/
│   ├── game/                       # scene, hotspot, inventory, puzzles/*
│   ├── hud/
│   ├── auth/
│   ├── lock-screen/
│   └── ui/                         # shared primitives if needed
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts               # Pool + drizzle instance
│   │   └── index.ts
│   ├── auth/
│   │   ├── jwt.ts
│   │   ├── password.ts
│   │   └── cookies.ts
│   ├── guards/
│   │   ├── verify-auth.ts
│   │   ├── device.ts               # ensureDeviceToken, verifyDevice
│   │   ├── lazy-expire.ts
│   │   ├── enforce-cooldown.ts
│   │   └── validate-save.ts
│   ├── game/
│   │   ├── level-config.ts         # durations, cooldowns, caps, stage counts
│   │   ├── content-config.ts       # IDs, hotspots, prerequisites, puzzles
│   │   ├── hints.server.ts         # hint text (server-only import)
│   │   ├── save-schema.ts          # zod
│   │   ├── save-validation.ts      # semantic checks §6.3
│   │   └── scoring.ts
│   └── api/
│       └── response.ts             # { ok, data|error, serverNow }
├── drizzle/
│   └── migrations/                 # generated, committed
├── public/
│   ├── scenes/
│   └── items/
├── scripts/
│   └── seed-and-reset.ts           # local only, tsx
├── drizzle.config.ts
├── .env.local                      # gitignored
├── .gitignore
├── INSTRUCTIONS.md
├── README.md
├── package.json
├── tsconfig.json
├── postcss.config.mjs
├── tailwind.config.ts
└── next.config.ts
```

Optional later: `hooks/use-game-machine.ts`, `types/`—only if the reducer grows large.

**Packages** (exact intent; versions pinned at init to **Next 15.x latest patch** unless you want strict lockfile review):

| Kind | Packages |
|------|----------|
| **Core** | `next@^15`, `react`, `react-dom`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom` |
| **Styling** | `tailwindcss`, `postcss`, `autoprefixer` (or Tailwind v4 stack if Next template ships it—still “Tailwind” per spec) |
| **UI / motion** | `lucide-react`, `framer-motion` |
| **DB** | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `ws` (Neon Pool on Node) |
| **Auth / crypto** | `jose`, `bcryptjs`, `@types/bcryptjs` |
| **Validation** | `zod` |
| **Scripts** | `tsx` (run `scripts/seed-and-reset.ts`) |
| **Dev** | `eslint`, `eslint-config-next` (from template) |

Not planned unless needed: ORM alternatives, edge adapters, analytics, fingerprinting libs (explicitly out of scope).

---

Confirm or adjust: Next **15.x pin**, `MAX_DEVICES=3` for build phase, folder naming (`gd_*` cookies vs project title), and whether GET `/api/state` should require `verifyDevice` or only “any registered device” (I’d implement: **must present valid `gd_device` that matches a row**, but not necessarily the session-start device). Once you approve, I’ll follow **§11 build order** starting with setup and guards/session start.


Cursor's response is good. The summary matches the spec, and the ambiguities it found are real ones I left open. Its folder structure and package list are sound, so you can approve with the decisions below.

## My verdict on its open questions

- **GET `/api/state` and the device guard:** Cursor's proposal is right. The request needs a valid `gd_device` that matches a registered row, but not necessarily the device that started the session.
- **Hint counter race:** I fixed this by making the hint endpoint also bump `revision`. A stale save then fails with `SAVE_CONFLICT` before the `hintCount` check, so legitimate saves are never rejected.
- **Scoring:** Cursor is right that it must be built, because test C1 requires it. Keep the formula simple.
- **Project folder name:** it proposed a folder with spaces and capitals, which can break `create-next-app` and npm naming. Use `vanishing-dr-hale`.
- **Missing packages:** add `@types/ws` (needed for the Neon Pool), `server-only` (stops hint text and puzzle solutions from ever being bundled into client code), and `dotenv` (for `drizzle.config` and the seed script).

## Reply to send Cursor

Paste this as your next message. Starting a fresh chat for it is fine, because it also asks Cursor to save the decisions into the spec.

```
Approved with the following decisions. Append everything below to @INSTRUCTIONS.md as a new "Section 16: Clarifications" (verbatim, as the final authority where it conflicts with earlier sections), then begin Phase A only.

SECTION 16: CLARIFICATIONS

16.1 Level mapping: server config maps minutes to level keys: 10->demo, 15->detective, 30->investigator, 60->master, 90->expert. Client sends minutes only. Extra body fields are ignored (zod strip, not strict).

16.2 Start transaction: steps 3 to 6 of session start (lazyExpire, enforceCooldown, verifyDevice incl. device registration, session + save_states insert) all run inside ONE transaction holding SELECT ... FOR UPDATE on the user row. Any failure rolls back everything. On DEVICE_LIMIT, nothing is registered.

16.3 Device on login/register: login and register ensure the gd_device cookie and TRY to register the device if under MAX_DEVICES. If the limit is reached, login still succeeds; start and state endpoints then return DEVICE_LIMIT.

16.4 GET /api/state: requires valid auth AND a gd_device cookie matching a registered row for that user (not necessarily the starting device). PUT /api/state and POST /api/hint: same device rule.

16.5 DEVICE_MISSING: if gd_device cookie is absent on start/state/hint, mint a new token, set it on the response, and return 403 DEVICE_MISSING. The client retries once automatically. If it fails again, show the "cookies blocked" screen.

16.6 hintCount: the stored save_states JSON is the only source. Only POST /api/hint changes it, and it also increments revision. PUT checks revision first (SAVE_CONFLICT), then rejects with 422 if the client hintCount differs from stored.

16.7 Scoring (mandatory): score = (solved puzzles x 100) - (hints x 10) + round(100 x remainingSeconds / durationSeconds). Minimum 0. Computed only on the server at completion.

16.8 Login rate limit: count login_failed rows in audit_events for that username in the last 10 minutes; block at 10 with 429 RATE_LIMITED. Perfect concurrency accuracy is not required.

16.9 Tamper policy: after 3 tamper_detected events in one session, set the session to invalidated and apply an integrity_violation cooldown.

16.10 Versions: pin Next.js 15.x using create-next-app@15. Use whatever Tailwind version the template ships. Run create-next-app in the current folder; if it refuses because of existing files, create it in a temp subfolder and move the files up. Project name: vanishing-dr-hale (lowercase, no spaces).

16.11 CSRF: in production, require the Origin header to equal APP_ORIGIN on every state-changing request. In development, also allow http://localhost:3000. Do not use Vercel preview deployments.

16.12 409 ACTIVE_SESSION_EXISTS body must include: sessionId, duration, startedAt, authoritativeExpiry, status.

16.13 First save: revision 0 holds the initial state built from the content config. Monotonicity checks always compare against the stored state.

16.14 Cookies: Secure flag = (NODE_ENV === "production"). Auth cookie 7 days, device cookie ~1 year.

16.15 DB pool: one module-level Neon Pool (small max, e.g. 5) with ws configured as the WebSocket constructor. All transactions use it. The HTTP driver is for read-only queries at most.

16.16 Extra packages approved: @types/ws, server-only, dotenv. hints.server.ts and puzzle solutions must import "server-only".

16.17 Test V9 now reads: a save whose hintCount differs from the stored value is rejected (422) or conflicts (409), and the stored hintCount never changes.

END OF SECTION 16

Phase A scope: project setup only (Next 15, Tailwind, packages, folder skeleton, .gitignore with .env*, .env.example listing every variable from Section 10, README stub). No database, auth, or game code yet. When done, tell me how to run it and verify it, and list any deviations.
```

## Why this is worth doing

- Saving the decisions into `INSTRUCTIONS.md` means every new chat for later phases inherits them, so Cursor can't forget them or reinterpret them.
- Cursor already agreed with most of these in its own proposals, so it should accept them without pushback.

## After Phase A

1. Run `npm run dev` and confirm the page loads.
2. Check that `.gitignore` really contains `.env*`. Do this before the first commit.
3. Commit.
4. Move to Phase B with the phase template from before, citing Sections 4, 2.1 and 16.

here the result ## Done

**Section 16** is appended to [INSTRUCTIONS.md](INSTRUCTIONS.md) as **SECTION 16: CLARIFICATIONS** (verbatim block, including `END OF SECTION 16`).

**Phase A** is complete: Next.js **15.5.28**, Tailwind **4** (template default), dependencies installed, folder skeleton, `.gitignore` (`.env*` with `!.env.example`), `.env.example`, README stub, placeholder home page.

---

### How to run and verify

```bash
cd "C:\Users\GIGABYTE\Documents\ING3\english\The Vanishing of Dr. Hale"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see **The Vanishing of Dr. Hale** and the scaffold message.

Optional checks:

```bash
npm run build   # already passed here
npm run lint
```

Copy `.env.example` → `.env.local` when you start Phase B; the app does not need env vars yet.

---

### Deviations / notes

| Item | Note |
|------|------|
| **App location** | `create-next-app` ran in `vanishing-dr-hale/` and files were moved to the repo root (existing `INSTRUCTIONS.md` / `.cursor`). |
| **Git** | Repo initialized at project root; the nested `.git` from the subfolder was removed. **Not pushed to GitHub** (Phase A scope did not include push). |
| **Tailwind** | **v4** + `@tailwindcss/postcss` (what `create-next-app@15` ships), not Tailwind 3. |
| **Turbopack** | Default `dev` / `build` scripts use `--turbopack`. |
| **React** | **19.1.0** (bundled with this Next template). |
| **Zod** | Resolved to **v4.x** (`^4.6.7`); spec assumed Zod generally — API differs slightly from v3 if we hit issues later. |
| **drizzle.config.ts** | Intentionally omitted until Phase B (no DB code yet). |
| **npm audit** | Template reports moderate/high advisories; not addressed in Phase A. |

Skeleton dirs are under `app/`, `components/`, `lib/`, `drizzle/migrations/`, `public/scenes|items/`, and `scripts/` (each with `.gitkeep`). No API routes, auth, or game logic yet.

Say when to start **Phase B** (schema + migrations).


Phase A looks good. Cursor followed Section 16, and the deviations it listed are all fine: Tailwind 4, Turbopack and React 19 are normal for this setup, and Zod 4 only matters if the API differs from what you expect.

## Before Phase B (about 10 minutes)

1. **Check the basics yourself:** run `npm run dev` and confirm the page loads. Then open `.gitignore` and confirm `.env*` is there with `!.env.example` after it.
2. **Check that git didn't pick up junk:** run `git status` and make sure no `.env.local` and no nested `.git` folder appear.
3. **Commit:** `git add -A`, then `git commit -m "Phase A: setup"`.
4. **Push to GitHub now.** Create a private repo and push. This is a backup, and you need it for Vercel later.
5. **Create the Neon project** (pick the region closest to you) and copy both connection strings, the **pooled** and the **direct** one. Put them in `.env.local` as `DATABASE_URL` and `DATABASE_URL_DIRECT`. Add a `JWT_SECRET` too (32+ random characters; any password generator works).
6. **Check `npm audit` later, not now.** Don't run `npm audit fix --force`, because it can break the Next 15 and Drizzle versions. Just before deploying, update Next to the latest 15.x patch and ignore the rest.

## Phase B prompt for Cursor

Start a new chat, attach `@INSTRUCTIONS.md`, and send:

```
Implement ONLY Phase B (Database) from Section 11 of @INSTRUCTIONS.md.
Relevant sections: 4, 2.1, 10, and Section 16 (16.15 especially).

Scope:
1. lib/db/schema.ts with the five tables exactly as in Section 4 (users, devices, game_sessions, save_states, audit_events), UUID primary keys generated by Postgres, timestamptz everywhere, all constraints and indexes, including:
   - the PARTIAL UNIQUE INDEX on game_sessions(user_id) WHERE status = 'active'
   - unique (user_id, token_hash) on devices
   - unique lowercase username on users
2. lib/db/client.ts: one module-level Neon Pool (max about 5) with ws set as the WebSocket constructor, wrapped with Drizzle. Use DATABASE_URL (pooled). Add import "server-only".
3. drizzle.config.ts using DATABASE_URL_DIRECT and dotenv to load .env.local.
4. Generate the migration with drizzle-kit, apply it to Neon, and add npm scripts for generate and migrate.
5. scripts/seed-and-reset.ts (run with tsx): create a test user, clear a user's cooldown, end any active session. Local use only.

Rules:
- Verify the Drizzle syntax for partial indexes and for the Neon Pool + ws setup against the CURRENT docs of the installed versions before writing it. Do not guess.
- No API routes, auth, or game logic in this phase.
- Do not touch files outside this phase unless required.

When done: show me the generated SQL migration, tell me how to verify it in the Neon SQL editor (tables, the partial unique index, the unique constraints), and list any deviations or doubts.
```

## How to verify Phase B yourself

In the Neon dashboard, open the SQL Editor and check:

- All five tables exist.
- The partial unique index exists. Look for the `WHERE status = 'active'` condition on `game_sessions`. This is the most important check, and Drizzle sometimes omits the condition, so read the generated SQL file in `drizzle/migrations/` before applying it.
- The `devices` unique constraint and the unique username exist.

Then try the guarantee directly. Insert two `active` sessions for one user in the SQL editor and confirm the second one fails. If it doesn't fail, the index is wrong; tell Cursor to fix it before you move on.

Paste the generated SQL here if you want me to review it before you commit.


cursor tell me that i hit the limit when in my account i used 60% 
Implementing Phase B: verifying installed Drizzle and Neon APIs, then implementing the schema, client, migrations, and seed script.
Implementing schema, client, config, and seed script; generating the migration next. 
if i chnage my account what is the prompt i need to send it to continue with what the other agent left


## Why this happens

The 60% figure is your total included usage. The "limit reached" message usually comes from a separate cap, such as a limit on one premium model or on Agent requests. Before you switch accounts, try these two things:

1. Change the model selector in the chat to **Auto** (or a cheaper model) and send a short message.
2. Start a new chat, because very long chats burn usage faster.

If that doesn't work, switching accounts is fine. Your work lives in your project folder, not in your Cursor account, so nothing is lost.

## Before you switch

Save whatever the previous agent managed to write:

```bash
git status
git add -A
git commit -m "Phase B: WIP (partial schema/client/config)"
git push
```

Make sure `.env.local` is not listed in `git status`. It is gitignored and stays on your disk, so the new account will still see it. The `.cursor/rules` file and `AGENTS.md` also stay in the folder, so you don't need to recreate them.

## Prompt for the new account

Open the same folder, start a new Agent chat, attach `@INSTRUCTIONS.md`, and send:

```
You are continuing Phase B (Database) from Section 11 of @INSTRUCTIONS.md. A previous agent was interrupted mid-task (usage limit), so the work is PARTIALLY done and its state is unknown. Do not assume anything is finished or correct.

Step 1: AUDIT FIRST (do not write code yet)
Inspect the current repo state and report, file by file, what exists and its status (complete / partial / missing / wrong) for:
- lib/db/schema.ts (five tables exactly as Section 4; partial unique index on game_sessions(user_id) WHERE status = 'active'; unique (user_id, token_hash) on devices; unique lowercase username)
- lib/db/client.ts (one module-level Neon Pool, max about 5, ws as WebSocket constructor, DATABASE_URL pooled, import "server-only")
- drizzle.config.ts (DATABASE_URL_DIRECT, dotenv loading .env.local)
- npm scripts for generate and migrate
- drizzle/migrations/ (generated SQL? applied to Neon or not?)
- scripts/seed-and-reset.ts (create test user, clear cooldown, end active session)
Also tell me whether .env.local contains DATABASE_URL, DATABASE_URL_DIRECT and JWT_SECRET (names only, never print values).

Step 2: PLAN
List exactly what remains, and wait for my OK.

Step 3: COMPLETE
After my OK, finish only what is missing or wrong. Follow Section 4, 2.1, 10 and Section 16 (especially 16.15 and 16.16). Verify the Drizzle partial-index syntax and Neon Pool + ws setup against the CURRENT docs of the installed versions before writing them; do not guess.

Rules:
- No API routes, auth, or game logic in this phase.
- Read the generated SQL migration and confirm it contains the WHERE status = 'active' condition on the partial unique index before applying it.
- Do not touch files outside Phase B unless required.

When done: show me the final SQL migration, explain how to verify it in the Neon SQL editor, and list any deviations or doubts.
```

The audit step is there because a half-finished agent session often leaves files that look complete but aren't, for example a schema without the partial index or a migration that was generated but never applied. Asking for an audit first stops the new agent from stacking more code on top of broken code.

## If you hit limits again

- Use **Auto** or a cheaper model for simple work such as scripts, config files, and UI placeholders.
- Keep the expensive model for the security-critical parts: the session-start transaction, save validation, and guards.
- Send short, single-purpose prompts. Every phase prompt can be split in two (for example, the schema first and the seed script second).
- Always commit before a long task, so a cut-off agent never costs you more than one step.


here the result

## Step 1: Audit (no code changes)

### Environment

| Item | Status |
|------|--------|
| **`.env.local`** | **Missing** on this machine (`FILE_MISSING`). Cannot confirm Neon connectivity or whether migrations were applied. |
| **`.env.example`** | Present; documents `DATABASE_URL`, `DATABASE_URL_DIRECT`, `JWT_SECRET`, and other Section 10 vars (values empty). |

Because `.env.local` is absent, **`DATABASE_URL`**, **`DATABASE_URL_DIRECT`**, and **`JWT_SECRET`** are **not present locally** (not “empty file with keys unset”—the file itself is missing).

---

### `lib/db/schema.ts`

| Check | Status |
|-------|--------|
| Five tables (`users`, `devices`, `game_sessions`, `save_states`, `audit_events`) | **Complete** — matches Section 4 columns/types in spirit (UUID PKs, `timestamptz` via `timestamp(..., { withTimezone: true })`, jsonb, etc.). |
| Partial unique index on `game_sessions(user_id)` WHERE `status = 'active'` | **Complete** — `uniqueIndex(...).where(sql\`${table.status} = 'active'\`)`. |
| Unique `(user_id, token_hash)` on `devices` | **Complete** — `uniqueIndex` on both columns. |
| Case-insensitive username / lowercase | **Complete per Section 4 wording** (“store lowercase”): `UNIQUE` on `username` column; enforcement is by app convention (seed script lowercases). No DB `CHECK` or `UNIQUE (lower(username))` — only matters if someone inserts mixed case via raw SQL. |
| Other indexes | **Complete** — `devices(user_id)`, `game_sessions(user_id, status)`, `game_sessions(expires_at)`. |
| FKs / cascades | **Complete** — aligns with schema (e.g. `save_states` → cascade, `audit_events` → set null). |
| Minor | **Partial / nit** — unused import `bigint` (only `bigserial` is used). |

---

### `lib/db/client.ts`

| Check | Status |
|-------|--------|
| `import "server-only"` | **Complete** |
| Module-level Neon `Pool`, `max: 5` | **Complete** |
| `neonConfig.webSocketConstructor = ws` | **Complete** |
| `DATABASE_URL` (pooled) | **Complete** — throws if unset |
| `drizzle-orm/neon-serverless` + schema | **Complete** |
| Pool error handler | **Complete** (extra but reasonable) |

Matches Section 2.1 and 16.15 at a high level; Step 3 should still re-check against **installed** `@neondatabase/serverless` / Drizzle docs before any edits.

---

### `drizzle.config.ts`

| Check | Status |
|-------|--------|
| `DATABASE_URL_DIRECT` for credentials | **Complete** |
| `dotenv` loading `.env.local` | **Complete** |
| `schema` / `out` paths | **Complete** |

**Note:** With missing `.env.local`, `url` becomes `""` — migrate will fail until env exists.

---

### npm scripts (`package.json`)

| Script | Status |
|--------|--------|
| `db:generate` → `drizzle-kit generate` | **Complete** |
| `db:migrate` → `drizzle-kit migrate` | **Complete** |

Dependencies for Phase B (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `ws`, `@types/ws`, `server-only`, `dotenv`, `tsx`, `bcryptjs`) appear **installed** in `package.json`.

---

### `drizzle/migrations/`

| Item | Status |
|------|--------|
| Generated SQL | **Complete** — `0000_init.sql` + `meta/_journal.json` + `0000_snapshot.json` |
| Partial index in SQL | **Complete** — line 58 includes `WHERE "game_sessions"."status" = 'active'` |
| Applied to Neon | **Unknown / likely not done here** — no `.env.local`, no way to query `__drizzle_migrations` or Neon from this audit |

Relevant excerpt from generated migration:

```58:58:drizzle/migrations/0000_init.sql
CREATE UNIQUE INDEX "game_sessions_one_active_per_user_idx" ON "game_sessions" USING btree ("user_id") WHERE "game_sessions"."status" = 'active';--> statement-breakpoint
```

---

### `scripts/seed-and-reset.ts`

| Check | Status |
|-------|--------|
| Create test user (bcrypt, lowercase username) | **Complete** — `create-user` |
| Clear cooldown | **Complete** — `clear-cooldown` |
| End active session | **Complete** — `end-session` |
| Not a web endpoint | **Complete** — CLI only |
| DB access | **Complete** — own Pool + ws; prefers `DATABASE_URL_DIRECT`, falls back to `DATABASE_URL` |

**Minor deviation (Phase B only):** `end-session` sets `endedAt` with `new Date().toISOString()` (app clock), not Postgres `now()`. Section 2.3 prefers DB time for authoritative fields; acceptable for a local maintenance script, could be tightened later.

No npm script alias (e.g. `db:seed`) — not required by your checklist.

---

### Scope check

No API routes, auth, or game logic spotted under `lib/db` / migrations / seed — **aligned with Phase B scope**.

---

## Step 2: Plan (waiting for your OK)

1. **Environment (blocker)**  
   - Add `.env.local` from `.env.example` with real Neon **pooled** → `DATABASE_URL`, **direct** → `DATABASE_URL_DIRECT`, and `JWT_SECRET` (needed for Phase C; good to set now).  
   - You must supply Neon values (not in repo).

2. **Apply migration**  
   - Run `npm run db:migrate` using **direct** URL (via `drizzle.config.ts`).  
   - Re-read `0000_init.sql` and confirm the partial index `WHERE` clause **before** applying (already verified in file; repeat at apply time per your rule).

3. **Neon verification (manual + optional script)**  
   - In Neon SQL editor: five tables, partial unique index, `devices_user_id_token_hash_unique`.  
   - Optionally smoke-test: `npx tsx scripts/seed-and-reset.ts create-user ...`, then `clear-cooldown` / `end-session`.

4. **Small fixes (only if still warranted after doc check)**  
   - Remove unused `bigint` import in `schema.ts`.  
   - Re-verify Drizzle partial-index `.where()` and Neon Pool + `ws` against **current** installed package docs; change only if something is wrong.

5. **Explicitly out of scope until later phases**  
   - Auth, API, game logic, Vercel env (unless you ask).

6. **Cannot do without you**  
   - Creating Neon project / connection strings if you do not have them yet.

Reply **OK** (and confirm you will add `.env.local` or that it already exists elsewhere and you want migrate run on this machine) when you want **Step 3** executed.



## Step 1: Audit (no code changes)

### Environment

| Item | Status |
|------|--------|
| **`.env.local`** | **Missing** on this machine (`FILE_MISSING`). Cannot confirm Neon connectivity or whether migrations were applied. |
| **`.env.example`** | Present; documents `DATABASE_URL`, `DATABASE_URL_DIRECT`, `JWT_SECRET`, and other Section 10 vars (values empty). |

Because `.env.local` is absent, **`DATABASE_URL`**, **`DATABASE_URL_DIRECT`**, and **`JWT_SECRET`** are **not present locally** (not “empty file with keys unset”—the file itself is missing).

---

### `lib/db/schema.ts`

| Check | Status |
|-------|--------|
| Five tables (`users`, `devices`, `game_sessions`, `save_states`, `audit_events`) | **Complete** — matches Section 4 columns/types in spirit (UUID PKs, `timestamptz` via `timestamp(..., { withTimezone: true })`, jsonb, etc.). |
| Partial unique index on `game_sessions(user_id)` WHERE `status = 'active'` | **Complete** — `uniqueIndex(...).where(sql\`${table.status} = 'active'\`)`. |
| Unique `(user_id, token_hash)` on `devices` | **Complete** — `uniqueIndex` on both columns. |
| Case-insensitive username / lowercase | **Complete per Section 4 wording** (“store lowercase”): `UNIQUE` on `username` column; enforcement is by app convention (seed script lowercases). No DB `CHECK` or `UNIQUE (lower(username))` — only matters if someone inserts mixed case via raw SQL. |
| Other indexes | **Complete** — `devices(user_id)`, `game_sessions(user_id, status)`, `game_sessions(expires_at)`. |
| FKs / cascades | **Complete** — aligns with schema (e.g. `save_states` → cascade, `audit_events` → set null). |
| Minor | **Partial / nit** — unused import `bigint` (only `bigserial` is used). |

---

### `lib/db/client.ts`

| Check | Status |
|-------|--------|
| `import "server-only"` | **Complete** |
| Module-level Neon `Pool`, `max: 5` | **Complete** |
| `neonConfig.webSocketConstructor = ws` | **Complete** |
| `DATABASE_URL` (pooled) | **Complete** — throws if unset |
| `drizzle-orm/neon-serverless` + schema | **Complete** |
| Pool error handler | **Complete** (extra but reasonable) |

Matches Section 2.1 and 16.15 at a high level; Step 3 should still re-check against **installed** `@neondatabase/serverless` / Drizzle docs before any edits.

---

### `drizzle.config.ts`

| Check | Status |
|-------|--------|
| `DATABASE_URL_DIRECT` for credentials | **Complete** |
| `dotenv` loading `.env.local` | **Complete** |
| `schema` / `out` paths | **Complete** |

**Note:** With missing `.env.local`, `url` becomes `""` — migrate will fail until env exists.

---

### npm scripts (`package.json`)

| Script | Status |
|--------|--------|
| `db:generate` → `drizzle-kit generate` | **Complete** |
| `db:migrate` → `drizzle-kit migrate` | **Complete** |

Dependencies for Phase B (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `ws`, `@types/ws`, `server-only`, `dotenv`, `tsx`, `bcryptjs`) appear **installed** in `package.json`.

---

### `drizzle/migrations/`

| Item | Status |
|------|--------|
| Generated SQL | **Complete** — `0000_init.sql` + `meta/_journal.json` + `0000_snapshot.json` |
| Partial index in SQL | **Complete** — line 58 includes `WHERE "game_sessions"."status" = 'active'` |
| Applied to Neon | **Unknown / likely not done here** — no `.env.local`, no way to query `__drizzle_migrations` or Neon from this audit |

Relevant excerpt from generated migration:

```58:58:drizzle/migrations/0000_init.sql
CREATE UNIQUE INDEX "game_sessions_one_active_per_user_idx" ON "game_sessions" USING btree ("user_id") WHERE "game_sessions"."status" = 'active';--> statement-breakpoint
```

---

### `scripts/seed-and-reset.ts`

| Check | Status |
|-------|--------|
| Create test user (bcrypt, lowercase username) | **Complete** — `create-user` |
| Clear cooldown | **Complete** — `clear-cooldown` |
| End active session | **Complete** — `end-session` |
| Not a web endpoint | **Complete** — CLI only |
| DB access | **Complete** — own Pool + ws; prefers `DATABASE_URL_DIRECT`, falls back to `DATABASE_URL` |

**Minor deviation (Phase B only):** `end-session` sets `endedAt` with `new Date().toISOString()` (app clock), not Postgres `now()`. Section 2.3 prefers DB time for authoritative fields; acceptable for a local maintenance script, could be tightened later.

No npm script alias (e.g. `db:seed`) — not required by your checklist.

---

### Scope check

No API routes, auth, or game logic spotted under `lib/db` / migrations / seed — **aligned with Phase B scope**.

---

## Step 2: Plan (waiting for your OK)

1. **Environment (blocker)**  
   - Add `.env.local` from `.env.example` with real Neon **pooled** → `DATABASE_URL`, **direct** → `DATABASE_URL_DIRECT`, and `JWT_SECRET` (needed for Phase C; good to set now).  
   - You must supply Neon values (not in repo).

2. **Apply migration**  
   - Run `npm run db:migrate` using **direct** URL (via `drizzle.config.ts`).  
   - Re-read `0000_init.sql` and confirm the partial index `WHERE` clause **before** applying (already verified in file; repeat at apply time per your rule).

3. **Neon verification (manual + optional script)**  
   - In Neon SQL editor: five tables, partial unique index, `devices_user_id_token_hash_unique`.  
   - Optionally smoke-test: `npx tsx scripts/seed-and-reset.ts create-user ...`, then `clear-cooldown` / `end-session`.

4. **Small fixes (only if still warranted after doc check)**  
   - Remove unused `bigint` import in `schema.ts`.  
   - Re-verify Drizzle partial-index `.where()` and Neon Pool + `ws` against **current** installed package docs; change only if something is wrong.

5. **Explicitly out of scope until later phases**  
   - Auth, API, game logic, Vercel env (unless you ask).

6. **Cannot do without you**  
   - Creating Neon project / connection strings if you do not have them yet.

Reply **OK** (and confirm you will add `.env.local` or that it already exists elsewhere and you want migrate run on this machine) when you want **Step 3** executed.


I have .env.example but i don't know from where i bring the data or what i should write 

```dotenv
# Neon Postgres — pooled connection (runtime)
DATABASE_URL=

# Neon Postgres — direct connection (migrations / drizzle-kit only)
DATABASE_URL_DIRECT=

# JWT (HS256) — use 32+ random characters; different per environment
JWT_SECRET=

# Verified on every JWT (any fixed strings)
JWT_ISSUER=vanishing-dr-hale
JWT_AUDUENCE=vanishing-dr-hale-players

# Registered devices per account (3 for rehearsal, 2 for production)
MAX_DEVICES=3

# Demo level cooldown override in seconds (default 120)
DEMO_COOLDOWN_SECONDS=120

# CSRF Origin check — your production Vercel URL (no trailing slash)
APP_ORIGIN=

```


Most of the values are already filled in. You only need to get three yourself: the two database URLs and the JWT secret.

## Step 0: Fix a typo in `.env.example`

Line 4 of the JWT section says `JWT_AUDUENCE`. It should be `JWT_AUDIENCE`. If the code reads `JWT_AUDIENCE`, the typo means it finds nothing. Fix it in `.env.example` and in the `.env.local` you're about to create.

## Step 1: Create `.env.local`

In your project folder, copy `.env.example` to a new file named exactly `.env.local`. Use a terminal command: `copy .env.example .env.local`. Or in Cursor, duplicate the file and rename it. Only `.env.local` gets real values. Leave `.env.example` empty, since it goes to GitHub.

## Step 2: Get the two database URLs from Neon

1. Go to [console.neon.tech](https://console.neon.tech) and open your project. If you haven't created one yet, click **New Project**, name it `vanishing-dr-hale`, and choose the region closest to you (for you, an EU region such as Frankfurt is a good choice).
2. On the project dashboard, click the **Connect** button.
3. A panel shows a connection string beginning with `postgresql://`. It has a **Connection pooling** toggle.
   - **Toggle ON:** copy the string. It has `-pooler` in the hostname. This is your `DATABASE_URL`.
   - **Toggle OFF:** copy the string. It has no `-pooler` in the hostname. This is your `DATABASE_URL_DIRECT`.
4. If the password is hidden, there is a show or reset password option in the same panel. The full string includes it.

Both strings look like this (yours will differ):

```
postgresql://username:password@ep-something-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

The pooled one has `ep-something-123456-pooler` in the hostname instead.

## Step 3: Generate `JWT_SECRET`

This is a random password that only you and the server know. Run this in your terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

It prints 64 random characters. Copy them into `JWT_SECRET`.

## Step 4: Fill in the rest

```dotenv
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
DATABASE_URL_DIRECT=postgresql://.../neondb?sslmode=require
JWT_SECRET=paste_the_64_characters_here
JWT_ISSUER=vanishing-dr-hale
JWT_AUDIENCE=vanishing-dr-hale-players
MAX_DEVICES=3
DEMO_COOLDOWN_SECONDS=120
APP_ORIGIN=http://localhost:3000
```

Rules for the file:
- No quotes around values.
- No spaces around `=`.
- `APP_ORIGIN` is `http://localhost:3000` for now. After you deploy to Vercel, you'll change it to your live URL (only in the Vercel settings, not here), with no trailing slash.

## Step 5: Check it worked

Run:

```bash
npm run db:migrate
```

If it finishes without an error, your database URL is correct. If it says authentication failed, you copied the wrong string or part of the password. Copy it again from Neon.

## Safety reminders

- `.env.local` is already covered by `.gitignore`. Run `git status` before committing and make sure it doesn't appear.
- Never paste these values into Cursor chat, GitHub, or screenshots. If you do by accident, reset the password in Neon and generate a new `JWT_SECRET`.
- Later, when you deploy, you'll enter these same variables in Vercel's settings (I'll walk you through it then). Use a **different** `JWT_SECRET` there.




