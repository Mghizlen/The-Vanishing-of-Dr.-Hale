# Progress

## Done
- Phases A-C
- Phase D: guards, session API, seeds, and 18/18 session checks

## In progress
- Final checks and README

## Remaining
- Final checks (skip F / Vercel deploy)

## Decisions
- `lib/session/` contains HTTP-adjacent session helpers: summaries and device-cookie gates.
- Expected transaction denials return values so lazy expiry and audits commit; unexpected errors roll back.
- Device-missing requests mint a cookie but never insert a device row before returning 403.
- Puzzle complexity will stay intentionally small while preserving server-side rules and all five levels.

## Known gaps
- Deployment and production-only acceptance checks remain manual.
