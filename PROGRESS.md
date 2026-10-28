# Progress

## Done
- Phases A-C
- Phase D: guards, session API, seeds, and 18/18 session checks

## In progress
- Complete

## Remaining
- Manual Vercel deployment and production/browser-only acceptance checks

## Decisions
- `lib/session/` contains HTTP-adjacent session helpers: summaries and device-cookie gates.
- Expected transaction denials return values so lazy expiry and audits commit; unexpected errors roll back.
- Device-missing requests mint a cookie but never insert a device row before returning 403.
- Puzzle complexity will stay intentionally small while preserving server-side rules and all five levels.

## Known gaps
- S10 production test and section 12.6 browser UI checks were not executable against a deployed URL.
- Art is CSS/SVG-style scene geometry rather than optimized image assets.
