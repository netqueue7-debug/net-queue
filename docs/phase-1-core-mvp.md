# Phase 1 — Core MVP

**Goal:** run one real volleyball night end to end. Admin creates a single event; members sign up; the going/waitlist boundary is correct under load; cancellations and capacity changes behave.

**Duration:** ~2 weeks · **Prerequisites:** Phase 0 complete

Read alongside: `docs/policy.md` (rules 1 and 4 apply here), `docs/architecture.md` (queue engine, critical section), `docs/conventions.md`.

> **Note (post-Phase-0b):** this phase shipped before groups existed. Every event/RSVP endpoint listed below is now additionally group-scoped per `docs/phase-0b-groups.md` — the tasks and checks below are left as-written (historical record of what Phase 1 delivered), not amended in place.

This phase contains the hardest correctness work in the project. Take the concurrency tests seriously.

## Tasks

- [x] **Schema: events + rsvps.** Per `architecture.md`. Include `max_guests_per_rsvp` and all location fields now even though guests arrive in Phase 2 — avoids a second migration on a live table. Index `(event_id, queue_position)` and `(event_id, status)`.
  - *Check:* migration applies clean; unique `(event_id, user_id)` rejects a double RSVP at the DB level.
  - Resolved an ambiguity between this doc and `architecture.md`: a flat `unique(event_id, user_id)` would make "cancel then re-signup creates a new row" (this doc, RSVP-create task) impossible. Went with a **partial unique index, active rows only** (hand-added SQL — Prisma's schema DSL can't express `WHERE`) — rejects a real double-RSVP while still allowing a new row once the prior one is canceled. Verified both halves in `tests/events-rsvps-schema.test.ts`.
  - `EventLog.eventId` and `Event.seriesId` are still forward-references (no FK on `seriesId` — `event_series` doesn't exist until Phase 2); `EventLog.eventId` now has a real FK since `events` exists.

- [x] **Seat math (pure function).** `computeDerivedStatuses(rsvps, capacity)` → map of rsvp id → `going | waitlist`. Implements atomic parties and **no skipping** (`policy.md#1`). Capacity `null` → everyone going. In Phase 1 every party is size 1, but write it party-aware now so Phase 2 is a data change, not a rewrite.
  - *Check:* table-driven unit tests covering capacity 0 / null / exact fit / party larger than remaining seats / all-canceled. This is the highest-value test file in the repo.
  - `lib/rsvp/seat-math.ts` — takes a `seats` field per RSVP rather than counting guests itself, so Phase 2 only needs to change what callers pass in, not this function. Caller is responsible for passing only active RSVPs (canceled rows aren't part of the queue). 7 table-driven cases in `tests/seat-math.test.ts`, including `policy.md#1`'s exact worked example verbatim.

- [x] **`withEventLock` helper.** The transaction wrapper from `architecture.md#the-critical-section`: opens transaction, takes `FOR UPDATE` on the event row, snapshots derived statuses, runs callback, recomputes, diffs, enqueues status-change notifications, commits. Every queue mutation goes through it.
  - *Check:* a test proving two concurrent calls serialize rather than interleave.
  - `lib/rsvp/with-event-lock.ts`. Notification diff only fires for RSVPs active in *both* the before and after snapshot with a changed status — a brand-new signup or a just-canceled RSVP has no real prior/subsequent status to "cross," so those are excluded by construction, not filtered after the fact.
  - Notifications: no DB table for this yet (none exists until Phase 3's `notifications/`), so "enqueue" is an in-memory list built during the transaction, dispatched (currently a `console.log` no-op) only after commit — satisfies "a Twilio failure must never roll back a queue mutation" by construction, since dispatch runs entirely outside the transaction.
  - Verified the concurrency test actually has teeth, not just luck: temporarily removed the `FOR UPDATE` lock and reran it 5x — failed 2/5 (real race). Restored the lock, reran 5x — passed every time.

- [x] **Admin: single-event CRUD.** Create/edit/cancel one-off events. Fields: title, description, start, end, timezone, capacity (nullable), `max_guests_per_rsvp` (nullable), `signup_opens_at`, `general_location`, `exact_location`, `location_reveal_policy`. Deleting = `status: canceled`, not a row delete.
  - *Check:* admin can create an event and see it listed; a member cannot reach any of these endpoints.
  - `lib/events/events.ts` + `app/api/events/`. `updateEvent` routes capacity changes through `withEventLock` (capacity is the one field that affects the RSVP queue boundary) and everything else through a plain update — sets up "Capacity change semantics" below to need no new mutation path, just tests.
  - `GET /api/events` and `GET /api/events/:id` are admin-only for now (not yet in `architecture.md`'s "Member" API section) — no location-gating serializer exists yet, so exposing these to members now would risk leaking `exact_location` pre-reveal. The "Location gating" and "Member event pages" tasks add the member-facing read path.
  - All 9 cases (create/list/edit/cancel × admin/member/unauthenticated, plus "cancel doesn't delete the row") verified against real Postgres in `tests/events-crud-route.test.ts`.

- [x] **Signup-open gating.** `signup_opens_at` enforced server-side inside the transaction. Before it opens, the event is visible with a countdown but the RSVP endpoint rejects with `SignupNotOpenError`.
  - *Check:* a request one second before open is rejected; one second after succeeds. Client clock manipulation has no effect.
  - Built as the first validation in the full `createRsvp` service (`lib/rsvp/rsvp.ts`) — all validation runs inside `withEventLock`'s transaction per `architecture.md`'s critical-section pseudocode, using `new Date()` server-side only, never a client-supplied timestamp (the route accepts none). Verified with real timing in `tests/signup-open-gating.test.ts`: rejected 1s before open, accepted 1s after, and a spoofed `now` in the request body has zero effect.

- [x] **Location gating in the serializer.** `lib/serializers/event.ts` decides what location fields ship to the client based on policy + current time + viewer role (admins always see full). The exact location must be **absent from the JSON**, not hidden in CSS.
  - *Check:* an integration test asserts the raw API response for a pre-reveal event contains no substring of `exact_location`.
  - `exactLocation` is `null` (not omitted, not present-but-empty) until reveal — the secret string itself is simply never in the payload, satisfying "absent from the JSON" regardless of how the key is handled.
  - `day_of`/`hidden`'s "local midnight of the event's day" is computed timezone- and DST-aware from `timezone` + `startsAt` alone (no date library — `Intl.DateTimeFormat` round-tripping). Verified against both an EDT (summer) and EST (winter) date to prove the DST math is actually correct, not just untested.
  - `hidden` differs from `day_of`: `day_of` shows `generalLocation` + a `locationRevealsAt` countdown pre-reveal; `hidden` shows nothing at all (not even `generalLocation`) until the same day-of moment.
  - This task only had a route to wire the serializer into once "Member event pages" exists, so the check runs directly against `serializeEvent`'s output (what an API response body would contain) in `tests/serialize-event.test.ts`, including the literal "no substring of the secret value" assertion.

- [x] **RSVP create.** Inside `withEventLock`: verify signup open, event not canceled, user not banned, user has accepted current waiver, no existing active RSVP. Assign `queue_position` from `MAX + 1` under the lock. Reusing a previously canceled RSVP → create a **new** row at the back of the queue (re-signing up means going to the end; state this in the UI).
  - *Check:* concurrency test below (the phase's 50-concurrent-RSVP exit criterion — run last, once every mutation exists).
  - `lib/rsvp/rsvp.ts` `createRsvp` + `POST /api/events/:id/rsvp`. Each business rule (canceled event, banned user, waiver not accepted, double-active-RSVP, re-signup creates a new row at the correct back-of-queue position) has its own real-Postgres test in `tests/rsvp-create.test.ts`, ahead of the full concurrency exit criterion.
  - Note for future UI work: re-signing up after a cancellation goes to the *back* of the queue, not back to the original position — the member-facing copy needs to say this explicitly so it isn't a surprise.

- [x] **RSVP cancel.** Sets `status: canceled`, `canceled_at`; row leaves the queue; boundary recomputes; anyone promoted is flagged for notification. No cutoff — allowed until event start (`policy.md#4`).
  - *Check:* with a full going list and a waitlist, canceling the first going RSVP promotes exactly the first waitlisted party and no one else.
  - `lib/rsvp/rsvp.ts` `cancelRsvp` + `DELETE /api/events/:id/rsvp`. No signup-cutoff check exists (or is needed) here — `policy.md#4` says cancellation is allowed anytime up to and including event start, so there's nothing to gate.
  - Tested with 5 users at capacity 2 (2 going, 3 waitlisted): canceling position 1 promotes exactly position 3 (first waitlisted), leaving positions 4 and 5 still waitlisted — proves the promotion doesn't over-promote past the first opening.

- [x] **Capacity change semantics.** `PATCH /events/:id` with a new capacity runs through `withEventLock`. Raising promotes from the top of the waitlist; lowering demotes from the bottom of going; `null` promotes everyone. No rows move — only the boundary.
  - *Check:* a test asserting exact membership before/after for raise, lower, and uncap.
  - No dedicated promote/demote code exists — this "just works" because `withEventLock` re-runs the same seat-math walk against the new capacity value; the before/after diff (already built for notifications) is exactly the promotion/demotion set. Verified exact membership with 5 users at capacity 2 → 4 → 1 → null in `tests/capacity-change.test.ts`.

- [x] **Member event pages.** List of upcoming events (status, your RSVP state, seats remaining or "waitlist only"). Detail page showing going / waitlist / canceled lists by display name, your position if waitlisted, countdown to signup open, and location per gating policy. RSVP and cancel buttons.
  - *Check:* Playwright happy path — member logs in, opens event, RSVPs, sees themselves in going, cancels, disappears from going.
  - `GET /api/events` and `GET /api/events/:id` (previously admin-only) now serve any authenticated member, gated by `serializeEvent`'s role-awareness instead of route access. New `getEventDetail`/`listEventsForMember` in `lib/rsvp/event-detail.ts` build the going/waitlist/canceled split and the viewer's own status.
  - `/events` and `/events/:id` pages, shared between member and admin (admin sees phone numbers + a Remove button per RSVP; member doesn't).
  - **Playwright/e2e setup notes, since several things fought back:** (1) real OTP login is already covered elsewhere (Phase 0's real round-trip, `tests/otp-verify-route.test.ts`) — re-driving it through a browser would mean a real SMS per test run for no new coverage, so the e2e test seeds a real session directly (the same `createSession()` the app uses) and injects it as a cookie; (2) Playwright Test's own module transform can't load Prisma's generated (ESM-only) client — same class of issue as running it under plain `node` — so seeding/cleanup run as a `tsx` child process instead; (3) Playwright's `webServer` health-check polls `127.0.0.1`, not `localhost`, which silently hung for 60s+ before failing — fixed by pointing `baseURL`/`webServer.url` at `127.0.0.1` explicitly; (4) that in turn tripped Next dev's cross-origin dev-resource block (blocks HMR/JS chunks from origins other than `localhost` by default), breaking client-side hydration — fixed with `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts`. Verified the real fix by first hitting each failure un-fixed and confirming the exact error, not just guessing.
  - Cleanup in the e2e seed/cleanup scripts is keyed by phone, not by the specific IDs created that run — a Playwright test timeout can kill the process before `finally` runs, and a phone-keyed cleanup remains correct even after that happens.

- [x] **Admin event view.** Same detail page plus full location, phone numbers, and the ability to remove a member's RSVP (goes through `withEventLock` like any cancellation).
  - *Check:* admin-removed RSVP triggers the same promotion behavior as a self-cancel.
  - `DELETE /api/admin/events/:id/rsvp` (body: `{ userId }`) reuses `cancelRsvp` with the admin as `actorUserId` — no new promotion logic, same `withEventLock` path as a self-cancel. `GET /api/admin/events` added for the admin management list (unfiltered, unlike the member-facing listing which excludes canceled events).
  - Verified: member can't call the removal endpoint (403); admin removal cancels the RSVP, promotes the waitlisted member, and logs the *admin* (not the removed member) as `event_log` actor.

- [x] **Event log writes.** Every queue mutation appends to `event_log` with actor, action, and payload.
  - *Check:* a signup → cancel → capacity change sequence produces three readable log rows.
  - Each mutation (`createRsvp`, `cancelRsvp`, `updateEvent`'s capacity path) writes its own `event_log` row inside its existing `withEventLock` transaction — `withEventLock` itself stays generic and doesn't need to know action/actor semantics.
  - `cancelRsvp` now takes an optional `actorUserId` (defaults to the target user — a self-cancel), so admin-removal in the "Admin event view" task below can reuse it unchanged with the admin as actor instead.
  - Plain (non-capacity) event edits are intentionally **not** logged here — they don't touch the queue, and the task's scope is "every queue mutation," not every edit.

## Exit criterion (hard gate)

**[x] Passed.** A load script fires **50 concurrent RSVPs** at a capacity-24 event at the instant signup opens. Assertions, all of which must hold:

1. Exactly 24 people are "going," 26 are waitlisted.
2. `queue_position` values are unique and contiguous.
3. Ordering matches server receipt order.
4. No user appears twice.
5. No request returns a 500.

`npm run load-test:rsvp` (`scripts/load-test-rsvp.ts`). First run **failed** for real — not a queue-logic bug, but a connection-pool/transaction-timeout limitation that would genuinely bite at this exact worst case: with pg's default pool size (10) and Prisma's default transaction `timeout` (5s), most of the 50 requests errored with `Unable to start a transaction in the given time`, because every RSVP attempt holds a DB connection *while queued behind `withEventLock`'s row lock*, not just while doing real work — so a small pool starves long before the lock semantics even come into play. Fixed by raising the `pg` pool size to 60 (`lib/db.ts`) and `withEventLock`'s transaction `maxWait`/`timeout` to 10s/30s (`lib/rsvp/with-event-lock.ts`) — a transaction waiting near the back of a 50-deep lock queue isn't hung, it's the lock working as designed, and the timeout needs room for that. Reran twice after the fix: 50/50 succeeded both times, exactly 24 going / 26 waitlisted, all 50 `queue_position` values unique and contiguous (1–50), no user twice, zero errors.

Then run one real volleyball night on it. Nothing ships to Phase 2 until a real night has run.

## Out of scope

Recurrence (Phase 2), +1s and approvals (Phase 2), SMS notifications (Phase 3 — Phase 1 only *enqueues* status changes, dispatch can be a no-op logger), admin dashboard, no-show tracking.
