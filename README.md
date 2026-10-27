# The Vanishing of Dr. Hale

Browser-based 2D mystery game with **server-authoritative** session time, cooldowns, and save state. Built with Next.js 15, Neon Postgres, and Drizzle ORM.

## Status

Phase A: project scaffold only. Database, auth, and gameplay arrive in later phases (see `INSTRUCTIONS.md`).

## Local development

1. Copy `.env.example` to `.env.local` and fill in values (not required until Phase B).
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000)

## Device limitations (for report / presentation)

See `INSTRUCTIONS.md` section 7.2. Summary: device binding is friction and consistency; **account-wide cooldown** is the primary anti-abuse control. New browsers or cleared cookies count as new devices (up to `MAX_DEVICES`). Cooldowns cannot be skipped by switching devices.

## Deployment

Production hosting: Vercel (Hobby). Database: Neon. Full steps in `INSTRUCTIONS.md` section 13.

## Specification

All build requirements: `INSTRUCTIONS.md` (section 16 overrides earlier sections on conflict).
