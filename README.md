# The Vanishing of Dr. Hale

An illustrated browser mystery game where the database clock controls every timed session. The client is untrusted: expiry, cooldowns, saves, hints, and scores are verified server-side.

Production: https://vanishing-dr-hale.vercel.app

## Frontend art assets

Place optional WebP files in `public/scenes` and `public/items`. Missing files automatically use the built-in CSS fallback scene or Lucide item icon.

### Scene files

| File | Scene description and hotspot placement |
|---|---|
| `public/scenes/study.webp` | Dr. Hale's study: desk calendar at 8%, 58% (18% x 24%), drawer at 28%, 63% (18% x 18%), torn letter at 54%, 65% (16% x 15%), wall portrait at 73%, 12% (17% x 35%). |
| `public/scenes/library.webp` | Library with tall shelves and a globe: bookshelf at 10%, 20% (35% x 65%), globe at 55%, 56% (18% x 25%). |
| `public/scenes/observatory-dome.webp` | Observatory dome with telescope and star chart: telescope at 12%, 42% (38% x 35%), star chart at 62%, 15% (25% x 30%). |
| `public/scenes/cellar.webp` | Shadowy cellar with crates and a locked chest: locked chest at 55%, 58% (28% x 25%), crates at 8%, 58% (30% x 28%). |
| `public/scenes/rooftop.webp` | Rooftop investigation board with footprints: final board at 22%, 14% (56% x 55%), footprints at 8%, 75% (26% x 15%). |

### Item files

Provide these exact filenames in `public/items`: `item_brass_key.webp`, `item_letter_full.webp`, `item_observatory_pass.webp`, `item_lens.webp`, `item_cellar_map.webp`, and `item_journal.webp`.

Use `/play?debug=hotspots` during local development to show hotspot rectangles and log click percentages. Debug mode is disabled in production. The play screen preloads the scene files, prioritizes the current scene, supports `prefers-reduced-motion`, and keeps a CSS/SVG-style fallback when art is absent.

## Tech stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS
- Neon Postgres with Drizzle ORM and pooled WebSocket transactions
- `jose` HS256 cookies, `bcryptjs`, and Zod validation
- Framer Motion and lucide-react for the game shell

## Environment variables

Set these in `.env.local` locally. Never commit an `.env` file.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled runtime connection |
| `DATABASE_URL_DIRECT` | Neon direct migration connection |
| `JWT_SECRET` | At least 32 random characters |
| `JWT_ISSUER` | JWT issuer |
| `JWT_AUDIENCE` | JWT audience |
| `MAX_DEVICES` | Registered device limit |
| `DEMO_COOLDOWN_SECONDS` | Optional demo cooldown override |
| `APP_ORIGIN` | Allowed application origin |

## Run locally

```text
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`, register, choose a level, and investigate. The local development cookie is not Secure; production cookies are Secure.

## Database and seed commands

Generate migrations with `npm run db:generate` and apply them with `npm run db:migrate` using `DATABASE_URL_DIRECT`. The migration files in `drizzle/migrations` are committed.

The local-only seed/reset script never runs as an endpoint:

```text
npx tsx scripts/seed-and-reset.ts create-user <username> <password>
npx tsx scripts/seed-and-reset.ts clear-cooldown <username>
npx tsx scripts/seed-and-reset.ts end-session <username>
npx tsx scripts/seed-and-reset.ts expire-session <username>
npx tsx scripts/seed-and-reset.ts set-solved <username>
```

## Honest limitations

| Scenario | Behaviour | Mitigation |
|---|---|---|
| Cookies deleted/private window | A new device token is registered if capacity remains | Cooldown is account-wide, so it cannot bypass a lock |
| Different browser on one computer | Counts as a separate device | The account-wide lock still applies |
| Device limit reached and cookies repeatedly cleared | A legitimate user can get stuck | Use the local admin seed reset; device removal is future work |
| Shared account | Cannot be fully prevented | One active session and one cooldown per account limit abuse |
| Cookies blocked | `DEVICE_MISSING` blocking screen | Enable cookies and retry |
| Many newly-created accounts | Each account has its own cooldown | Email verification/CAPTCHA is future work |

Device binding is a friction and consistency layer; the primary defence is the server-side account-wide lock.

## Vercel deployment checklist

- [ ] Import the repository into Vercel with the Next.js preset.
- [ ] Set the same environment variable names in the Vercel Production environment.
- [ ] Use a different `JWT_SECRET` for production.
- [ ] Set `APP_ORIGIN` to the Vercel URL with no trailing slash.
- [ ] Set `MAX_DEVICES=2` for production.
- [ ] Run migrations with the Neon direct connection before the first live test.
- [ ] Pick the Vercel function region closest to Neon `eu-central-1` (Frankfurt).
- [ ] Confirm HTTPS cookies, login, session start, state save, and cooldown on the deployed URL.
- [ ] Keep a local fallback, a cooldown account, and a screen recording for presentation day.

## Verification

```text
npx tsx scripts/test-auth.ts
npx tsx scripts/test-session.ts
npx tsx scripts/test-state.ts
```

The browser-only UI checks, production S10 test, and Vercel deployment remain manual.
