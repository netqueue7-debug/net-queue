# CLAUDE.md

Event waitlist system — capacity-limited recurring events (volleyball first, generic by design) with phone-auth signup, strict FCFS queue, +1 approvals, and staged location reveal.

**Stack:** Next.js (App Router, TypeScript) · PostgreSQL · Prisma · Twilio Verify (OTP) + Twilio SMS · Tailwind · Vitest + Playwright

## Read before you work

Load only what the task needs. Do not read every file.

| File | Read it when |
|---|---|
| `docs/policy.md` | Any change touching RSVPs, seats, guests, or capacity. **Non-negotiable business rules.** |
| `docs/architecture.md` | Any change to the data model, the queue engine, or API shape. |
| `docs/conventions.md` | Writing any code — style, testing, error handling, transaction patterns. |
| `docs/phase-0-foundations.md` | Auth, sessions, schema bootstrap, waiver acceptance. |
| `docs/phase-1-core-mvp.md` | Single-event CRUD, RSVP queue engine, location gating, capacity changes. |
| `docs/phase-2-recurrence-guests.md` | Recurring series, +1 lifecycle, admin approval, guest waivers. |
| `docs/phase-3-polish.md` | Notifications, admin dashboard, event log, ops. |

**Current phase: Phase 0.** Work in phase order. Do not build ahead of the current phase — later-phase concerns are deliberately deferred and building them early creates rework.

## Invariants — never violate these

1. **One queue per event.** `going` / `waitlist` are *derived at read time* from queue order and seat math. Never store them as a status column, never "move" a row between lists.
2. **Queue position is immutable.** Assigned once at signup, never reassigned or renumbered.
3. **All RSVP mutations run inside a transaction holding a per-event lock.** Signup, cancel, guest approval, capacity change. No exceptions — see `docs/architecture.md#the-critical-section`.
4. **Exact location is never serialized to the client before its reveal time.** Gate it server-side, not in the UI.
5. **Phone number is the identity anchor.** One account per number, unique constraint enforced at the DB level.
6. **Every OTP-sending endpoint is rate-limited.** SMS pumping fraud is a real cost risk.

## Commands

```bash
npm run dev            # local dev server
npm run db:migrate     # apply migrations
npm run db:studio      # inspect data
npm run test           # unit + integration (Vitest)
npm run test:e2e       # Playwright
npm run lint           # eslint + tsc --noEmit
```

## Working agreement

- Ask before adding a dependency or changing the schema in a way not described in the phase doc.
- Every task in a phase doc has an acceptance check — run it before marking the task done.
- Update the phase doc's checklist as you complete items.
- If a requirement seems ambiguous, check `docs/policy.md` first; those five rules settle most disputes. If it's still ambiguous, ask rather than guess.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
