# Phase 0 — Foundations

**Goal:** a deployed app where a person can log in with their phone number, accept the waiver, and be recognized as a member or admin. No events yet.

**Duration:** ~1 week · **Prerequisites:** none

Read alongside: `docs/architecture.md` (data model), `docs/conventions.md`.

## Tasks

- [x] **Project bootstrap.** Next.js + TypeScript strict + Tailwind + ESLint. Prisma wired to Postgres (hosted on Neon rather than docker-compose — no local Postgres/Docker install needed). `.env.example` documenting every variable.
  - *Check:* `npm run dev`, `npm run lint`, `npm run test` all pass on a clean clone.

- [x] **Schema: users + waivers.** `users` and `waiver_signatures` per `architecture.md`. Unique index on `phone` (store E.164 normalized). Also create the `event_log` table now — cheap, and everything after this wants to write to it.
  - *Check:* migration applies clean; inserting a duplicate phone fails at the DB level, not just in app code.

- [x] **Twilio Verify integration.** `lib/auth/otp.ts` wrapping send + check. Phone normalized to E.164 before send. US numbers only (`geo permissions` restricted in the Twilio console *and* validated server-side).
  - *Check:* real OTP round-trips against a test number.

- [x] **OTP abuse controls.** This is the expensive attack surface — do it now, not later.
  - Rate limit per phone (3 sends/hour) and per IP (10/hour), backed by Postgres or Upstash Redis.
  - Cloudflare Turnstile on the send endpoint.
  - Global daily send ceiling with an alert when crossed.
  - *Check:* an automated test hammering `/auth/otp/send` gets 429s and triggers no further Twilio calls.
  - Also backed by Twilio Verify Fraud Guard (Standard) + US-only geo permissions as a second layer.
  - Turnstile verification is wired server-side (`lib/auth/turnstile.ts`) using Cloudflare's published test keys — swap in real Site/Secret keys once the phone-entry UI (First-login onboarding task) exists to host the widget.

- [x] **Sessions.** httpOnly, secure, sameSite cookie; DB-backed session or signed JWT with rotation. `getSession()` helper plus `requireMember()` / `requireAdmin()` guards usable from route handlers and server components.
  - *Check:* an unauthenticated request to a guarded endpoint returns 401; a member hitting an admin endpoint returns 403.
  - Went DB-backed (not JWT) — sessions can be revoked immediately (delete the row), which matters given `users.banned_at` needs to take effect right away, not after a JWT expires.

- [x] **First-login onboarding.** After first successful OTP verification: collect `display_name`, present the waiver text, require explicit acceptance. Record `waiver_accepted_at` + `waiver_version` on the user and a row in `waiver_signatures`.
  - *Check:* a user who hasn't accepted the current waiver version is redirected to the waiver screen and cannot reach member pages.
  - Built the full login journey to make this checkable: `/login` (phone + real Turnstile widget → OTP send/verify), `/onboarding` (display name + waiver), `/home` (placeholder member page). `display_name` is nullable on `users` until onboarding completes (a user row now exists once phone-verified, profile completion is a separate step).
  - Verified for real against the running dev server: unauthenticated → redirected to `/login`; authenticated-but-not-onboarded → redirected to `/onboarding`; after accepting → reaches `/home`.

- [x] **Waiver content + versioning.** Waiver text stored as a versioned constant (`WAIVER_VERSION` + markdown). Bumping the version re-prompts everyone on next login.
  - *Check:* bumping the constant re-prompts an already-accepted user.
  - `lib/waivers/content.ts` — text is placeholder, clearly marked NOT reviewed/approved legal language. Replace before real signups; bumping `WAIVER_VERSION` when it's replaced is exactly what re-prompts everyone (proven in `tests/waiver-versioning.test.ts`).

- [x] **Roles + first admin.** `role` on users; a seed script or one-off command to promote a phone number to admin.
  - *Check:* seeded admin can reach a placeholder `/admin` page; a member cannot.
  - `npm run admin:promote -- <phone>` (`scripts/promote-admin.ts`, run via `tsx` — needed because Prisma's generated client uses extensionless imports plain Node can't resolve). Upserts, so it works whether or not the phone has logged in yet.
  - Verified for real against the running dev server: the promoted admin's session reaches `/admin` (200); a plain member's session is redirected to `/home` (307).

- [ ] **Deploy.** Vercel + managed Postgres (Neon or Supabase). Migrations run on deploy. Secrets set. A staging environment separate from production.
  - *Check:* full login flow works on the deployed URL from a real phone.
  - **QA/staging: done.** `qa` branch → Vercel Preview → `qa.netqueue.org`, pointed at the existing `dev` Neon branch (kept separate from any future production data by design, per your call). `vercel-build` runs `prisma migrate deploy` on every deploy. Twilio/Turnstile creds are shared with production (per your call — no per-environment cost/config reason to split them); `DATABASE_URL` is the only env var that differs by environment.
  - **Production: not started, deferred at your request.** Needs its own Neon branch (or the `main` git branch could just point at the same `dev` data if you decide not to bother splitting further — your call when you get there), Production-scoped env vars (`DATABASE_URL` is the only one missing — Twilio/Turnstile are already set for Production too), and a real deploy of `main` (currently errored from before secrets existed).

## Exit criteria

A teammate on their own phone can visit the deployed site, log in via OTP, accept the waiver, and land on a (placeholder) member home page. An admin account exists. Hammering the OTP endpoint costs nothing.

## Out of scope

Events, RSVPs, guests, recurrence, notifications beyond OTP, any UI polish. Do not create the `events` table yet — Phase 1 owns it.
