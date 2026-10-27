# INSTRUCTIONS.md: "The Vanishing of Dr. Hale"
### A 2D Illustrated Mystery/Puzzle Game: Build, Deploy & Host Specification

> **Audience:** one developer starting from an empty folder, with roughly 24 hours before a university presentation.
> **Rule of this document:** it contains specifications, rules, and step-by-step instructions only. All code is written by you. The only literal commands shown are terminal commands for setup.

---

## 0. How to Use This Document

1. Read sections 1 to 3 (about 15 minutes). They contain every decision already made for you.
2. Build in the order of **Section 11 (Build Order and Timeline)**. It is sequenced so you always have something demo-able.
3. Anything marked **[MUST]** is graded or demo-critical. Anything marked **[LATER]** is optional polish; skip it if you are behind.
4. Section 12 is your acceptance test suite. Do not call the project finished until section 12's "Critical" tests pass on the **deployed** Vercel URL, not just localhost.

---

## 1. Product Summary

A browser-based, 2D illustrated detective game. The player investigates a single case (the disappearance of Dr. Hale at Blackwood Observatory) by clicking objects in illustrated scenes, collecting inventory items, and solving puzzles. The unique technical feature is that **time is controlled by the server**. The player picks a duration (10 to 90 minutes). The server decides when the session started, when it expires, and whether the account is allowed to play again. Nothing the browser does can extend a session or skip a cooldown.

### 1.1 Difficulty Levels (Duration-Based) [MUST]

| Key | Duration | Display name | Stages used | Puzzles | Max hints | Cooldown after end* |
|---|---|---|---|---|---|---|
| `demo` | 10 min | Quick Demo (Idea Preview) | 1 | 2 | 3 | 2 min |
| `detective` | 15 min | Detective | 2 | 3 | 5 | 30 min |
| `investigator` | 30 min | Investigator | 3 | 4 | 4 | 60 min |
| `master` | 60 min | Master Detective | 4 | 5 | 3 | 120 min |
| `expert` | 90 min | Expert | 5 | 6 | 2 | 180 min |

\* Cooldown values are **configuration, not hard-coded**. Put them in one config file and allow an environment variable to override the demo cooldown. The demo cooldown is deliberately short so you can show the cooldown lock screen live in front of the class.

**Demo mode behaviour:** it is a normal server-authoritative session (it still has expiry and cooldown), only shorter and smaller. Do not build a special bypass. The point of the presentation is that the rules are real.

### 1.2 Game Content Outline (keep it small) [MUST]

One case, five possible stages. Lower levels use only the first N stages, so you write the content once.

| Stage # | Scene | Key objects (inspectable) | Puzzle(s) | Reward |
|---|---|---|---|---|
| 1 | The Study | desk calendar, drawer, torn letter (half A), wall portrait | **P1** Drawer combination (digits hidden in calendar circles). **P2** Torn letter (find half B, combine halves in inventory) | Brass key, full letter |
| 2 | The Library | bookshelf, globe, reading lamp | **P3** Order the books by spine colour (hint on letter) | Observatory pass |
| 3 | Observatory Dome | telescope, star chart, brass dial | **P4** Align the star chart to the dial using the dates on the letter | Lens, cellar map |
| 4 | The Cellar | crates, wine rack, locked chest | **P5** Substitution cipher on the chest (key found in the portrait frame) | Dr. Hale's journal |
| 5 | The Rooftop | weather vane, footprints, final board | **P6** Final accusation: choose culprit, method, and motive from lists | Case closed |

Rules for content:
- Every object, item, stage, and puzzle has a **stable string ID** (for example `obj_desk_calendar`, `item_brass_key`, `puz_drawer_code`). These IDs are what the save file stores and what the server validates against.
- Demo mode ends after P2 (stage 1 only). Detective ends after P3. Investigator after P4. Master after P5. Expert includes P6.
- **Illustrations:** one background image per scene (16:9, about 1600x900, WebP or optimized PNG) plus small transparent PNGs/SVGs for items. Generate them with any image tool or use free assets; keep each file under 300 KB. Put hotspots (clickable regions) as percentage-based rectangles in your content config so they scale on every screen size.

### 1.3 Hints and Scoring [LATER, but hintCount is MUST]
- A hint reveals a text nudge for the current puzzle and increments `hintCount` server-side.
- The server refuses a hint once the level's maximum is reached.
- Final score = base points per puzzle, minus a penalty per hint, plus a time bonus proportional to remaining time. Compute it **on the server** at completion.

---

## 2. Technology Stack and Pinned Decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Use the latest **15.x** patch. Reason: Next 14 had a middleware authorization bypass fixed only in late patches, and 15.x is the safest "14+" option. Whichever you use, **never rely on middleware alone for auth**; every API route and server action re-verifies. In Next 15, `cookies()` and `headers()` are asynchronous; remember to await them. |
| Styling | Tailwind CSS | Mobile-first; the game stage uses a fixed 16:9 container scaled to fit. |
| Icons | lucide-react | Timer, Lock, Search, Backpack, Lightbulb, etc. |
| Animation | Framer Motion | Scene transitions, item-pickup fly-to-inventory, modal enter/exit, countdown pulse in the last 60 seconds. |
| Database | Neon serverless Postgres | Free tier is enough. |
| ORM | Drizzle ORM + drizzle-kit | Migrations are generated into a folder and committed. |
| Auth | `jose` (JWT, HS256) | Token in an HttpOnly, Secure, SameSite=Lax cookie. |
| Password hashing | `bcryptjs` (pure JS) | Runs in the Node runtime; do **not** import it from edge/middleware code. |
| Validation | `zod` | Validates every request body and the save-state JSON. |
| Hosting | Vercel Hobby | Non-commercial use only (fine for a university project). |

### 2.1 Neon driver decision (important gotcha) [MUST]
Neon offers an HTTP driver and a WebSocket/pooled driver. The **HTTP driver does not support interactive multi-statement transactions**. The session-start sequence needs a real transaction (row lock plus insert). Therefore:
- Use the **WebSocket (Pool) driver** with Drizzle for anything that needs a transaction (session start, session end, save).
- Optionally use the HTTP driver for simple read-only queries.
- Use the **pooled** connection string at runtime and the **direct** (non-pooled) string for running migrations.

### 2.2 Runtime
- All API routes and server actions: `nodejs` runtime (not edge).
- Pick the Vercel function region closest to your Neon region (both listed in their dashboards). Mismatched regions add noticeable latency to every request.

### 2.3 Server-vs-Client time rule [MUST]
- **Only the database clock (`now()` in Postgres) is authoritative.** Never use `Date.now()` from the client, and avoid mixing app-server clocks with database clocks when comparing expiry.
- The client receives `serverNow` and `authoritativeExpiry` in every response and computes a **display-only** offset. The countdown is cosmetic. Whenever the countdown hits zero, or every 30 seconds, the client asks the server for the real status.

---

## 3. Architecture

### 3.1 Diagram

```
┌──────────────────────────── BROWSER ─────────────────────────────┐
│  Next.js client components                                       │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ Scene view │  │ Inventory /  │  │ Countdown (display only)│   │
│  │ + hotspots │  │ puzzle modals│  │ + Frontend State Machine│   │
│  └─────┬──────┘  └──────┬───────┘  └────────────┬────────────┘   │
│        └──────── local game state ──────────────┘                │
│  Cookies (HttpOnly, invisible to JS):                            │
│    gd_auth   = JWT (jose)                                        │
│    gd_device = random device token                               │
└───────────────┬───────────────────────────────────────▲──────────┘
                │ HTTPS fetch (cookies auto-attached)   │ JSON + serverNow
┌───────────────▼───────────────────────────────────────┴──────────┐
│                  VERCEL (Next.js, Node runtime)                  │
│  Route Handlers / Server Actions                                 │
│   ├─ auth:    register, login, logout, me                        │
│   ├─ device:  ensure device cookie (hash only is stored)         │
│   ├─ session: start, status, abandon, complete                   │
│   ├─ state:   get save, put save, use hint                       │
│   └─ shared guards: verifyAuth, verifyDevice, enforceCooldown,   │
│                     lazyExpire, validateSaveSchema               │
└───────────────┬──────────────────────────────────────────────────┘
                │ Pooled WebSocket driver (transactions)
┌───────────────▼──────────────────────────────────────────────────┐
│          NEON POSTGRES (Drizzle ORM, migrations committed)       │
│  users · devices · game_sessions · save_states · audit_events    │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Core principles [MUST]
1. **Fail closed.** If the database is unreachable or any validation step errors, the answer is "no session". The UI shows an explicit blocking error. There are no silent fallbacks, no "play offline anyway", and no local-only sessions.
2. **Lazy expiry.** Vercel Hobby cron is limited to once per day, so do not depend on background jobs. Instead, every request that touches a session first runs a "lazy expire" check: if status is `active` and `expires_at <= now()`, flip it to `expired` and set the account cooldown in the same transaction.
3. **Client is untrusted.** Anything in local storage, memory, or the request body that conflicts with the server (expiry, duration, session id, cooldown) is ignored and overwritten.
4. **One active session per account**, enforced by the database itself (partial unique index), not just by application code.
5. **Privacy:** the raw device token never touches the database. Only its SHA-256 hash is stored. Passwords are stored only as bcrypt hashes. Never log tokens, cookies, or passwords.

---

## 4. Database Schema (Drizzle + Neon) [MUST]

Define these in a single schema file. Use UUID primary keys generated by Postgres. Use `timestamptz` for every timestamp.

### 4.1 `users`
| Column | Type | Rules |
|---|---|---|
| id | uuid PK | default random |
| username | text | unique, 3 to 24 chars, case-insensitive uniqueness (store lowercase) |
| password_hash | text | bcrypt |
| cooldown_until | timestamptz null | **account-wide lock**; null or in the past means free to play |
| cooldown_reason | text null | `expired`, `abandoned`, `completed`, `integrity_violation` |
| created_at | timestamptz | default now |

### 4.2 `devices`
| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK to users | on delete cascade |
| token_hash | text | SHA-256 of the raw token, hex encoded |
| first_seen_at | timestamptz | default now |
| last_seen_at | timestamptz | updated on use |
| user_agent_label | text null | optional coarse label like "Chrome / Windows" (no fingerprinting) |

Constraints: unique on `(user_id, token_hash)`. Index on `user_id`.

### 4.3 `game_sessions`
| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK to users | |
| device_id | uuid FK to devices | the device that **started** the session |
| duration_key | text | one of the five level keys |
| duration_seconds | integer | copied from server config at start (never from client) |
| started_at | timestamptz | `now()` from the database |
| expires_at | timestamptz | `started_at + duration_seconds` computed in SQL |
| ended_at | timestamptz null | set when status leaves `active` |
| status | text | `active`, `expired`, `abandoned`, `completed`, `invalidated` |
| score | integer null | set on completion |

**Critical constraint:** a **partial unique index** on `user_id` where `status = 'active'`. This is the atomic guarantee that two simultaneous start requests cannot both succeed. The loser of the race gets a unique-violation which you translate into the `ACTIVE_SESSION_EXISTS` error.

Other indexes: `(user_id, status)`, `(expires_at)`.

### 4.4 `save_states`
| Column | Type | Rules |
|---|---|---|
| session_id | uuid PK, FK to game_sessions | one save per session, on delete cascade |
| schema_version | text | `"1.0"` |
| state_json | jsonb | the validated save document (section 6) |
| revision | integer | starts at 0, increments on each accepted write (optimistic concurrency) |
| updated_at | timestamptz | |

### 4.5 `audit_events` [LATER but cheap and impressive]
| Column | Type | Rules |
|---|---|---|
| id | bigserial PK | |
| user_id | uuid null | |
| session_id | uuid null | |
| type | text | `session_started`, `start_denied_cooldown`, `start_denied_device`, `session_expired`, `save_rejected`, `tamper_detected`, `login_failed` |
| detail | jsonb | small, no secrets |
| created_at | timestamptz | default now |

Use this table during the presentation to show the examiner the server actually refused things.

### 4.6 Migration workflow
- Generate migrations with drizzle-kit and **commit the migration folder**.
- Apply them to Neon using the **direct** connection string.
- Create a small **seed/reset script** (run locally with your database URL) that can: create a test user, clear a user's cooldown, and end any active session. You will need it for rehearsals and as an emergency reset before the presentation. Never expose it as a public web endpoint.

---

## 5. Core Backend API / Actions [MUST]

All endpoints return JSON of the form: success `{ ok: true, data, serverNow }` or failure `{ ok: false, error: { code, message, ...extra }, serverNow }`. Always include `serverNow` (database time).

Use Route Handlers (simple to test with a REST client) or Server Actions; whichever you choose, the guard logic below is identical. Every endpoint except register and login begins with `verifyAuth`.

### 5.1 Shared guards (write these first, as reusable server functions)

| Guard | What it does | Failure |
|---|---|---|
| `verifyAuth` | Read `gd_auth` cookie, verify JWT signature, expiry, and issuer/audience with jose; confirm the user still exists in the database | 401 `UNAUTHENTICATED` |
| `ensureDeviceToken` | If `gd_device` is absent, generate 32 cryptographically random bytes, encode as base64url, and set the cookie (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age about 1 year). Returns the raw token for this request only | none |
| `verifyDevice` | Hash the cookie token with SHA-256, look up `(user_id, hash)`. If found, update `last_seen_at`. If not found and the account has fewer than `MAX_DEVICES` registered devices, register it. Otherwise reject | 403 `DEVICE_LIMIT` |
| `lazyExpire` | In a transaction, lock the user's active session if any; if past expiry, mark `expired`, set `ended_at`, set `users.cooldown_until = now + cooldown(level)` and reason `expired` | none (state change) |
| `enforceCooldown` | After `lazyExpire`, read `users.cooldown_until`; if in the future, reject | 423 `COOLDOWN_ACTIVE` with `cooldownUntil` |
| `validateSaveSchema` | Zod-validate the save JSON and run the semantic checks in section 6.3 | 422 `SAVE_INVALID` |

`MAX_DEVICES` is an environment/config value. Recommended: **2** for production, **3** while you rehearse (laptop, phone, and the presentation machine).

### 5.2 Auth endpoints

| Endpoint | Behaviour |
|---|---|
| `POST /api/auth/register` | Validate username and password (min 8 chars). Reject duplicates with 409 `USERNAME_TAKEN`. Hash with bcrypt. Create user. Issue the JWT cookie. Call `ensureDeviceToken` and register the device. |
| `POST /api/auth/login` | Look up the user; compare hash. Use the **same generic error** for unknown user and wrong password (`INVALID_CREDENTIALS`, 401) to avoid account enumeration. Add a simple rate limit (for example 10 attempts per 10 minutes per username, tracked via `audit_events`). Issue JWT, ensure device cookie. |
| `POST /api/auth/logout` | Clear the `gd_auth` cookie by setting it expired. Logging out does **not** end a session or clear a cooldown. |
| `GET /api/auth/me` | Return username and current account status (cooldownUntil, active session summary if any). Used on app boot. |

JWT rules: HS256; secret from an environment variable of at least 32 random characters; payload contains the user id as subject, an issued-at time, an expiry (7 days is fine), plus issuer and audience claims that you verify on every request. Cookie flags: `HttpOnly`, `Secure` (disable only on localhost via an environment check), `SameSite=Lax`, `Path=/`.

CSRF note: with SameSite=Lax plus JSON-only POSTs that require a `Content-Type: application/json` header, simple cross-site form posts are blocked. Additionally verify that the `Origin` header matches your site on all state-changing requests.

### 5.3 `POST /api/session/start` [MUST: the validation sequence]

Request body: `{ duration: 10 | 15 | 30 | 60 | 90 }` (the level key is derived from this on the server).

**Execute these steps strictly in this order. Stop at the first failure and return its error. Steps 3 to 6 happen inside one database transaction that locks the user row (`SELECT ... FOR UPDATE`).**

| # | Step | Failure response |
|---|---|---|
| 1 | **Verify auth** (`verifyAuth`) | 401 `UNAUTHENTICATED` |
| 2 | **Check valid duration**: the value must exactly match one of the five allowed minute values from server config. Look up level settings server-side. | 400 `INVALID_DURATION` |
| 3 | **Check account cooldown**: run `lazyExpire` first (an expired old session must convert into a cooldown before this check), then `enforceCooldown`. | 423 `COOLDOWN_ACTIVE` + `cooldownUntil` |
| 4 | **Validate device binding** (`verifyDevice`) | 403 `DEVICE_LIMIT` (or `DEVICE_MISSING` if cookies are blocked entirely) |
| 5 | **Atomically insert the session**: insert with `started_at = now()` and `expires_at = now() + duration` computed by the database; the partial unique index guards against concurrent starts. Also insert the initial empty `save_states` row (revision 0) in the same transaction. | 409 `ACTIVE_SESSION_EXISTS` + the existing session summary (so the client can offer Resume) |
| 6 | **Return** `{ sessionId, duration, startedAt, authoritativeExpiry, serverNow, initialState }` | none |

If anything unexpected throws in steps 3 to 6, roll back and return 503 `SERVICE_UNAVAILABLE`. The client must show a blocking error. Log an audit event. **Do not** let the client start playing.

### 5.4 Remaining session endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /api/session/status` | Runs `lazyExpire`, then returns one of: `{state: "none"}`, `{state: "active", session, remainingSeconds}`, `{state: "cooldown", cooldownUntil, reason}`. This is the single source of truth the client polls. |
| `POST /api/session/abandon` | Ends the active session with status `abandoned` and **applies the cooldown** (so abandoning is not a loophole to reroll). The UI must show a confirmation dialog first. |
| `POST /api/session/complete` | Server verifies the saved state actually satisfies the completion condition for that level (all required puzzles in `solvedPuzzles`), session still not expired, then marks `completed`, computes score, applies the level's cooldown. Rejects with 422 `NOT_COMPLETE` otherwise. The client saying "I won" is never enough. |

### 5.5 State endpoints (see section 6 for the document format)

| Endpoint | Behaviour |
|---|---|
| `GET /api/state` | Returns the save document for the user's active session, plus `revision`. Works from **any registered device** (this is the cross-device resume). Runs `lazyExpire` first; if expired, returns 410 `SESSION_EXPIRED` + cooldown info. |
| `PUT /api/state` | Body: `{ revision, state }`. Steps: verifyAuth, verifyDevice, lazyExpire, confirm the session is active and owned by the caller, schema-validate, semantic-validate, check `revision` equals stored revision (else 409 `SAVE_CONFLICT` returning the server copy), then store and increment the revision. The server **overwrites** `sessionId`, `duration`, and `authoritativeExpiry` in the stored JSON with its own values, whatever the client sent. |
| `POST /api/hint` | Server checks the level's hint cap, increments `hintCount` in the stored state, returns the hint text for the current puzzle. Hint text lives on the server only (not in the client bundle) so it cannot be read for free. |

### 5.6 Error code catalogue (the frontend must handle every one)

| Code | HTTP | Meaning | Required UI |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing/invalid JWT | Redirect to login |
| `INVALID_CREDENTIALS` | 401 | Login failed | Inline form error |
| `USERNAME_TAKEN` | 409 | Register conflict | Inline form error |
| `INVALID_DURATION` | 400 | Duration not allowed | Error banner (should never occur in normal UI) |
| `COOLDOWN_ACTIVE` | 423 | Account locked | **Full-screen lock** with live countdown to `cooldownUntil` and the reason |
| `DEVICE_LIMIT` | 403 | Too many devices for this account | Full-screen explanation with the limit number |
| `DEVICE_MISSING` | 403 | Cookies disabled/blocked | Instruction to enable cookies |
| `ACTIVE_SESSION_EXISTS` | 409 | Already playing | Offer "Resume" button |
| `SESSION_EXPIRED` | 410 | Time is over | **Full-screen "Time's up"** then cooldown screen |
| `SAVE_CONFLICT` | 409 | Stale revision | Silently re-fetch and merge for the player, but tell them if progress was lost |
| `SAVE_INVALID` | 422 | Bad/tampered state | Reload from server; log tamper event |
| `NOT_COMPLETE` | 422 | Completion refused | Message |
| `RATE_LIMITED` | 429 | Too many attempts | Message with wait time |
| `SERVICE_UNAVAILABLE` | 503 | DB/server failure | **Blocking error with Retry button; the game cannot start or continue** |

---

## 6. Versioned Save / Resume State [MUST]

### 6.1 Schema version 1.0 (document structure)

The save file is one JSON object with these fields:

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | string | Always `"1.0"`. Reject anything else, or route to a migration function when you later add 1.1. |
| `sessionId` | string (uuid) | Which session this belongs to. Server-controlled. |
| `duration` | integer | Minutes (10/15/30/60/90). Server-controlled. |
| `authoritativeExpiry` | string (ISO 8601 UTC) | Server-controlled. Display aid only on the client. |
| `currentStage` | integer 1 to 5 | Must not exceed the stage count for the level. |
| `inventory` | array of strings | Item IDs. |
| `inspectedObjects` | array of strings | Object IDs. Treated as a **set**: store as an array, deduplicate on read and write (JSON has no set type). |
| `solvedPuzzles` | array of strings | Puzzle IDs. Also deduplicated. |
| `hintCount` | integer >= 0 | Total hints used. |

Optionally add a `clientUpdatedAt` hint field, but never trust it for any decision.

### 6.2 Which fields are server-owned
`sessionId`, `duration`, `authoritativeExpiry` are **overwritten on every save** from the `game_sessions` row. `hintCount` can only be incremented through the hint endpoint, so a save that lowers or raises it by itself is rejected.

### 6.3 Semantic validation rules (this is your anti-cheat)
Reject (422) and write a `tamper_detected` audit event if any of the following is true:
1. An ID does not exist in the game content config (unknown item, object, or puzzle).
2. `currentStage` is higher than the level allows, or jumps forward by more than one stage in a single save.
3. A puzzle appears in `solvedPuzzles` whose prerequisite items or stage requirements are not met. Keep a prerequisite map in the content config.
4. A save **removes** a previously solved puzzle or inspected object (progress is monotonic). Inventory may lose items only if the content config marks them as consumable.
5. `hintCount` differs from the server's counter.
6. Payload is larger than a sensible cap (for example 20 KB).

Optionally, after **repeated** tamper events in one session, invalidate the session and apply the `integrity_violation` cooldown.

### 6.4 Sync strategy
- **Local first, server authoritative:** the client keeps state in memory (and optionally mirrors it to local storage purely for faster reloads).
- **Debounced autosave:** send `PUT /api/state` about 2 seconds after the last meaningful change, plus immediately after solving a puzzle or changing stage, plus on tab close using a keepalive request.
- **Never queue saves across an expiry.** If a save returns 410, discard the queue and go to the expired screen.
- **Resume flow:** on boot, call `/api/session/status`. If `active`, fetch `/api/state` and **replace** local state entirely with the server copy; local copies never win. If the local mirror's `sessionId` differs from the server's, delete the local mirror.
- **Cross-device resume:** log in on a second registered device, boot calls status, then resumes the same session with the same server expiry. The timer is never reset by moving devices.
- **Local state tampering:** editing local storage has no effect because the server copy replaces it on load, and bad saves are rejected.

---

## 7. Device Restriction and Privacy [MUST]

### 7.1 Mechanism
1. First authenticated request lacking a `gd_device` cookie: the server generates a random token (32 bytes, base64url) and sets it as an HttpOnly, Secure, SameSite=Lax cookie with a long lifetime.
2. The server stores **only the SHA-256 hash** of that token in `devices`, linked to the user.
3. On session start (and on state endpoints), the server hashes the cookie value and checks it against the user's registered devices, enforcing `MAX_DEVICES`.
4. The raw token exists only in the cookie and in server memory during the request. A database leak reveals no usable device tokens.

### 7.2 Honest limitations (put these in your presentation and README) [MUST]

| Scenario | What happens | Why it is acceptable |
|---|---|---|
| User deletes cookies or uses a private window | A brand-new device token appears; it registers as a new device (if the limit allows) | The **account-wide cooldown** is stored on the user, not the device, so a new device cannot skip a lock |
| User opens a different browser on the same computer | Treated as a separate device (separate cookie jar) | Same as above; counts toward `MAX_DEVICES` |
| User has hit `MAX_DEVICES` and clears cookies repeatedly | Legit users can get stuck | Provide an admin reset (seed script) and show a clear explanation screen; a self-service "remove a device" page is a [LATER] feature |
| Shared account between two people | Cannot be fully prevented | One active session and one cooldown per account limits abuse |
| Cookies blocked entirely | `DEVICE_MISSING` | Clear instruction screen |
| A user creates many accounts | Each account has its own cooldown | Out of scope; mention email verification or CAPTCHA as future work |

**Design statement for your report:** device binding is a *friction and consistency* layer. The **primary defence is the server-side, account-wide lock**.

### 7.3 Privacy checklist
- No IP addresses stored, no fingerprinting libraries, no third-party analytics.
- Only SHA-256 hash of device token stored; passwords bcrypt-hashed.
- User-agent label (if used) is coarse text only.
- Logs and audit events contain no tokens, cookies, or passwords.

---

## 8. Frontend State Machine [MUST]

Implement the app flow as one explicit state machine (a reducer, or a small library; a hand-rolled reducer with a `status` field is fine). The UI renders purely from the current state, which prevents impossible screens.

### 8.1 Top-level states

| State | Entry condition | What the screen shows |
|---|---|---|
| `BOOTING` | App load | Splash while calling `/api/auth/me` and `/api/session/status` |
| `LOGGED_OUT` | No valid auth | Login / Register forms |
| `LOBBY` | Authed, no active session, no cooldown | Five level cards (name, duration, difficulty, hint cap) |
| `STARTING` | Level chosen | Spinner; the start request is in flight; buttons disabled |
| `PLAYING` | Start or resume success | The game (see sub-states) |
| `COOLDOWN_LOCKED` | `COOLDOWN_ACTIVE`, or status says cooldown | Full-screen lock, reason, live countdown, no start button |
| `DEVICE_BLOCKED` | `DEVICE_LIMIT` / `DEVICE_MISSING` | Explanation screen |
| `EXPIRED` | Timer reached zero **and** server confirmed expiry | "Time's up" animation, then move to `COOLDOWN_LOCKED` |
| `COMPLETED` | Server accepted completion | Score, case summary |
| `FATAL_ERROR` | `SERVICE_UNAVAILABLE` or unknown error | Blocking error with Retry; no gameplay |

### 8.2 `PLAYING` sub-states
`EXPLORING` (browsing a scene) -> `INSPECTING` (object detail modal) -> `PUZZLE_ACTIVE` (puzzle modal) -> `INVENTORY_OPEN` -> `HINT_SHOWN`, and a parallel flag `SYNC_STATUS` with values `saved`, `saving`, `offline_retrying`, `conflict`. Show the sync status as a small icon in the HUD.

### 8.3 Transition rules

| From | Event | To | Guard / effect |
|---|---|---|---|
| BOOTING | auth failed | LOGGED_OUT | |
| BOOTING | status = none | LOBBY | |
| BOOTING | status = active | PLAYING | fetch state, replace local |
| BOOTING | status = cooldown | COOLDOWN_LOCKED | |
| LOBBY | choose level | STARTING | send start request |
| STARTING | success | PLAYING | store expiry offset |
| STARTING | 423 | COOLDOWN_LOCKED | |
| STARTING | 403 | DEVICE_BLOCKED | |
| STARTING | 409 `ACTIVE_SESSION_EXISTS` | PLAYING | resume that session |
| STARTING | 503 / network failure | FATAL_ERROR | **no fallback** |
| PLAYING | countdown hits 0 | (verify) | call status; if expired go to EXPIRED, else adopt server time |
| PLAYING | any API returns 410 | EXPIRED | discard unsent saves |
| PLAYING | all puzzles solved | (verify) | call complete; success goes to COMPLETED |
| PLAYING | player abandons | (confirm) | confirm dialog, then call abandon, then COOLDOWN_LOCKED |
| EXPIRED | animation ends | COOLDOWN_LOCKED | |
| COOLDOWN_LOCKED | countdown hits 0 | (verify) | call status; only if server says free go to LOBBY |
| FATAL_ERROR | Retry | BOOTING | |

### 8.4 UI requirements
- **Countdown HUD:** always visible during play; turns amber under 5 minutes and red/pulsing under 60 seconds (Framer Motion).
- **Never trust a zero:** reaching zero always triggers a server check before changing screens.
- **Tab visibility:** when the tab becomes visible again, immediately re-sync with the server (timers throttle in background tabs).
- **Error UI:** every code in section 5.6 has a defined screen or message. A request failing must never look like a normal state.
- **Accessibility and responsiveness:** keyboard-focusable hotspots with `aria-label`; the scene scales to the viewport; touch-friendly hit areas.
- **Animations to include:** scene cross-fade, item pickup flying into the inventory bar, modal spring-in, lock screen shake when the user retries early.

---

## 9. Project Structure (recommended)

```
/app
  /(auth)/login, /register
  /(game)/lobby, /play
  /api/auth/*  /api/session/*  /api/state  /api/hint
/components     scene, hotspot, inventory, puzzles/*, hud, lock-screen
/lib
  /db           schema, client (pool), migrations output
  /auth         jwt, password, cookies
  /game         level-config, content-config, save-schema, validation, scoring
  /guards       verify-auth, device, cooldown, lazy-expire
/public/scenes  /public/items
/scripts        seed-and-reset (local only)
INSTRUCTIONS.md  README.md
```

Keep **level config** (durations, cooldowns, caps) and **content config** (IDs, hotspots, prerequisites, hint texts) in `/lib/game` as the only places where game numbers live. Hint texts and puzzle solutions are imported only by server code.

---

## 10. Environment Variables

| Name | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string | Used at runtime |
| `DATABASE_URL_DIRECT` | Neon **direct** connection string | Used only for migrations |
| `JWT_SECRET` | HS256 signing key | 32+ random characters; different for production and local |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Verified claims | Any fixed strings |
| `MAX_DEVICES` | Device limit per account | 3 for rehearsal, 2 for final |
| `DEMO_COOLDOWN_SECONDS` | Override for demo cooldown | 120 default |
| `APP_ORIGIN` | Expected Origin for CSRF check | Your Vercel URL |

Rules: never commit `.env` files; add them to `.gitignore` before your first commit; set the same variables in Vercel for the Production environment (Preview is optional).

---

## 11. Build Order and Timeline (24-hour plan)

| Phase | Time | Deliverable | Done when |
|---|---|---|---|
| A. Setup | 0:00 to 1:00 | Create the Next.js app, Tailwind, install lucide-react, framer-motion, drizzle-orm and drizzle-kit, the Neon driver, jose, bcryptjs, zod. Create Neon project and `.env.local`. Initialise git and push to GitHub. | `npm run dev` shows a page |
| B. Database | 1:00 to 2:30 | Schema, migrations applied to Neon, partial unique index confirmed in the Neon SQL editor | Tables exist |
| C. Auth | 2:30 to 4:30 | Register, login, logout, me; cookies visible as HttpOnly in browser dev tools | Section 12 tests A1 to A5 |
| D. Guards + session API | 4:30 to 8:00 | Device guard, lazy expiry, cooldown, start/status/abandon/complete | Tests S1 to S10 |
| E. Save API | 8:00 to 10:00 | GET/PUT state, validation, hint endpoint | Tests V1 to V7 |
| F. **Deploy early** | 10:00 to 11:00 | Deploy to Vercel now (see section 13); fix env problems while there is time | Production login works |
| G. Frontend shell | 11:00 to 14:00 | State machine, lobby, lock screens, HUD, error screens | Tests U1 to U6 (with placeholder art) |
| H. Game content | 14:00 to 19:00 | Scenes, hotspots, inventory, puzzles P1 to P2 first (this completes demo mode), then P3 to P6 | Demo level playable end to end |
| I. Polish | 19:00 to 21:00 | Framer Motion, responsive fixes, art | |
| J. Full test + rehearsal | 21:00 to 23:00 | Run section 12 on the production URL; rehearse the demo script (section 14) twice | All Critical tests pass |
| K. Buffer / sleep | 23:00 to 24:00 | Do not add features. | |

**If you run behind:** do not remove levels, because all five must work. Instead, cut puzzle *complexity* (make P4 to P6 simple multiple-choice puzzles) and keep all five levels functional. The server-authoritative system matters more than puzzle sophistication.

---

## 12. Acceptance Test Suite

Run on the deployed URL with two different browsers (or one normal plus one private window) and a REST client for direct API probing. **Critical** tests must pass before the presentation.

### 12.1 Auth (A)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| A1 | Critical | Register a new user | Account created; logged in; `gd_auth` and `gd_device` cookies set, both HttpOnly and Secure (verify in dev tools Application tab; JS `document.cookie` must not list them) |
| A2 | Critical | Log out, then log in with correct password | Success |
| A3 | Critical | Log in with wrong password, and with unknown username | Same generic error message for both |
| A4 | High | Call any protected endpoint with no cookie | 401 `UNAUTHENTICATED` |
| A5 | High | Edit one character of the JWT cookie value, then call `/api/auth/me` | 401 |
| A6 | Medium | Register a duplicate username | 409 |

### 12.2 Session start and cooldown (S)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| S1 | Critical | Start each of the five levels on fresh accounts (or after resets) | Returned expiry equals start plus exactly 10/15/30/60/90 minutes |
| S2 | Critical | POST start with duration 20, 0, -5, "abc", or missing | 400 `INVALID_DURATION` each time; no session row created |
| S3 | Critical | POST start twice concurrently (two tabs or a quick script) | Exactly one session row exists; the other request gets `ACTIVE_SESSION_EXISTS` |
| S4 | Critical | Start the demo level, wait for expiry (or temporarily shorten via seed script/config) | Session becomes `expired`; `cooldown_until` is set; UI shows the Time's Up then lock screen |
| S5 | Critical | While locked, press the start button (if reachable) or call start directly | 423 `COOLDOWN_ACTIVE` with `cooldownUntil`; lock screen displayed; no session created |
| S6 | Critical | During cooldown, log out and log in again, then log in from another browser | Still locked everywhere (account-wide) |
| S7 | Critical | After the cooldown passes, start again | Succeeds |
| S8 | High | Abandon an active session | Cooldown applied; confirmation dialog appeared first |
| S9 | High | Send a forged body field like `expiresAt` or `cooldownUntil` in start | Ignored; server values used |
| S10 | Critical | Break the database connection (temporarily set a wrong `DATABASE_URL` in a **preview** deployment or local env) and press start | 503; blocking error screen; **no gameplay possible** |
| S11 | High | Leave a session open, never call the API, come back after expiry and call status | Lazily expired; cooldown set |

### 12.3 Device (D)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| D1 | Critical | Inspect the `devices` table in Neon | Only hex SHA-256 hashes; no raw token present |
| D2 | High | Clear cookies, log in again | New device row (if under limit); cooldown still enforced |
| D3 | High | Exceed `MAX_DEVICES` with extra browsers/profiles and try to start | 403 `DEVICE_LIMIT`; explanation screen |
| D4 | Medium | Disable cookies entirely | `DEVICE_MISSING` guidance |
| D5 | High | Edit the device cookie to garbage | Treated as unknown device (registers or rejects per limit); never grants extra access |

### 12.4 Save / resume (V)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| V1 | Critical | Play, solve P1, refresh the page | Resumes with the same stage, inventory, and remaining time |
| V2 | Critical | Log in on a second registered device mid-session | Same state; **same expiry timestamp**; timer not reset |
| V3 | Critical | Edit local storage to add items or a solved puzzle, refresh | Server state replaces it; edits have no effect |
| V4 | Critical | PUT a save with an unknown puzzle ID, a skipped stage, or removed solved puzzle | 422 `SAVE_INVALID`; audit event recorded |
| V5 | Critical | PUT a save with a different `authoritativeExpiry`/`duration`/`sessionId` | Stored values remain the server's |
| V6 | High | Save after expiry | 410 `SESSION_EXPIRED` |
| V7 | High | Two tabs save with the same stale revision | One succeeds; the other gets `SAVE_CONFLICT` and recovers |
| V8 | High | Request more hints than the cap | Rejected after the cap; `hintCount` accurate |
| V9 | High | Set `hintCount` manually to 0 via a save | Rejected |
| V10 | Medium | Pull the network during play, restore it | Sync indicator shows retrying then saved; no data loss |

### 12.5 Completion (C)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| C1 | Critical | Finish the demo level legitimately | `COMPLETED`; score computed by the server |
| C2 | Critical | Call complete without solving puzzles | 422 `NOT_COMPLETE` |
| C3 | High | Call complete after expiry | Refused; expired flow instead |

### 12.6 UI / frontend (U)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| U1 | Critical | Change the computer's clock forward and back by an hour | Gameplay and lock decisions unaffected (server clock rules); display self-corrects on next sync |
| U2 | High | Background the tab for several minutes, return | Immediate re-sync; correct time shown |
| U3 | High | Trigger each error code in section 5.6 | Every one has a visible, non-silent screen/message |
| U4 | Medium | Test at phone width and desktop width | Scene scales; hotspots usable by touch |
| U5 | Medium | Navigate with the keyboard only | Hotspots focusable with labels |
| U6 | Medium | Check animations at the 60-second warning | Pulsing red timer |

### 12.7 Deployment (P)
| ID | Priority | Steps | Expected |
|---|---|---|---|
| P1 | Critical | Open the production URL on a phone with cellular data | Loads over HTTPS; login works |
| P2 | Critical | Confirm no secrets in the browser bundle (search the shipped JS for the JWT secret/DB URL; confirm none are prefixed for public exposure) | Absent |
| P3 | High | Check cold start latency after 10 idle minutes | Acceptable (a few seconds); mentioned in rehearsal |
| P4 | High | Check Vercel function logs after the test run | No unhandled errors; no sensitive data logged |

---

## 13. Vercel + Neon Deployment Guide [MUST]

### 13.1 One-time preparation
1. Create a **Neon** account and project. Choose the region nearest your audience (note the region name).
2. In the Neon dashboard, copy two connection strings: **pooled** and **direct**. Confirm both include SSL mode requirements.
3. Create a **GitHub** repository (private is fine) and push your project. Confirm `.env*` files are ignored.
4. Create a **Vercel** account (Hobby plan) and sign in with GitHub.

### 13.2 Database first
1. Put the direct string in your local `.env.local` as `DATABASE_URL_DIRECT`.
2. Generate migrations with drizzle-kit and apply them to Neon from your machine.
3. Open Neon's SQL editor and verify: all five tables exist, the **partial unique index** on active sessions exists, and the unique `(user_id, token_hash)` constraint exists.

### 13.3 Deploy
1. In Vercel: **Add New, Project**, import the GitHub repo. Framework preset auto-detects Next.js.
2. Add all variables from section 10 under **Environment Variables** (Production). `APP_ORIGIN` will be the Vercel URL; if you do not know it yet, deploy once, copy the URL, set the variable, and redeploy.
3. Deploy. Every push to the main branch redeploys automatically.
4. Set the function region (Project Settings, Functions) to match Neon's region if it is not already close.
5. Open the live URL and run tests A1, S1, and V1 immediately.

### 13.4 Hobby-tier facts to respect
- Hobby is for **non-commercial** use: appropriate for a university project.
- Serverless functions have a default execution limit (about 10 seconds on Hobby by default, configurable up to a higher cap). Your endpoints are short, so you are fine; do not run long loops.
- Cron jobs are limited to daily frequency, which is exactly why this design uses lazy expiry instead.
- Neon's free tier **suspends idle compute**; the first request after idle can take a second or two. **Warm it up 10 minutes before presenting** by logging in and starting/abandoning a test session with a throwaway account.
- Keep image assets optimized (Vercel's bandwidth on Hobby is limited but ample for a demo).

### 13.5 Common deployment failures
| Symptom | Likely cause | Fix |
|---|---|---|
| Works locally, 500 on Vercel | Missing environment variable | Add in Vercel and redeploy |
| Login succeeds but next request says unauthenticated | Cookie `Secure` flag on http, or cookie domain/path mistake | Use HTTPS (Vercel provides it); only relax `Secure` on localhost |
| Transaction errors in session start | Using the HTTP driver for transactions | Switch that path to the WebSocket pool driver |
| Slow every request | Region mismatch between Vercel and Neon | Align regions |
| Migration fails | Using the pooled string | Use the direct string for migrations |
| Edge runtime error mentioning bcrypt or Node APIs | Route accidentally running at edge | Force `nodejs` runtime on those routes |

### 13.6 Backup plan for presentation day [MUST]
- Keep a **local copy running** (`npm run dev` pointed at the same Neon database) in case venue Wi-Fi blocks something.
- Pre-create two accounts: one clean for the live demo, one already **in cooldown** for showing the lock screen instantly.
- Record a 2-minute screen recording of the full flow as insurance.
- Have the reset script ready in a terminal, with your DB URL loaded.

---

## 14. Presentation Demo Script (about 8 minutes)

1. **(1 min) Problem statement:** timed mystery game where cheating the clock is impossible.
2. **(1 min) Architecture slide:** show the diagram from section 3.1; emphasise "server is the only clock".
3. **(2 min) Live demo:** register, pick **Quick Demo (10 min)**, inspect an object, pick up an item, solve P1. Point at the HUD sync icon.
4. **(1 min) Cross-device resume:** open the same account on your phone; show the same expiry time.
5. **(1 min) Cheat attempts:** edit local storage (nothing changes); change computer clock (nothing changes); open Neon's `devices` table (hashes only).
6. **(1 min) Cooldown:** switch to the pre-locked account and show the lock screen and the 423 in the network tab.
7. **(1 min) Limitations and future work:** the honest device table from section 7.2; email verification, device management page, WebSocket live sync, more cases.

---

## 15. Definition of Done

- [ ] All **Critical** tests in section 12 pass on the Vercel production URL.
- [ ] Five levels selectable; each starts with the correct server-computed expiry.
- [ ] Cooldown lock persists across logout/login and across browsers.
- [ ] No gameplay is possible when the backend fails (explicit error UI).
- [ ] Database contains only hashed device tokens and hashed passwords.
- [ ] Save/resume works across two devices with identical expiry.
- [ ] README lists the device limitations from section 7.2.
- [ ] Backup plan items from section 13.6 prepared.

Good luck. Build the guards and the session start sequence first; everything else is decoration around that core.

---

## SECTION 16: CLARIFICATIONS

(Final authority where it conflicts with earlier sections.)

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
