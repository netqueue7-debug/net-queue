# Phase 1 — Core MVP

**Goal:** run one real volleyball night end to end. Admin creates a single event; members sign up; the going/waitlist boundary is correct under load; cancellations and capacity changes behave.

**Duration:** ~2 weeks · **Prerequisites:** Phase 0 complete

Read alongside: `docs/policy.md` (rules 1 and 4 apply here), `docs/architecture.md` (queue engine, critical section), `docs/conventions.md`.

This phase contains the hardest correctness work in the project. Take the concurrency tests seriously.

## Tasks

- [ ] **Schema: events + rsvps.** Per `architecture.md`. Include `max_guests_per_rsvp` and all location fields now even though guests arrive in Phase 2 — avoids a second migration on a live table. Index `(event_id, queue_position)` and `(event_id, status)`.
  - *Check:* migration applies clean; unique `(event_id, user_id)` rejects a double RSVP at the DB level.

- [ ] **Seat math (pure function).** `computeDerivedStatuses(rsvps, capacity)` → map of rsvp id → `going | waitlist`. Implements atomic parties and **no skipping** (`policy.md#1`). Capacity `null` → everyone going. In Phase 1 every party is size 1, but write it party-aware now so Phase 2 is a data change, not a rewrite.
  - *Check:* table-driven unit tests covering capacity 0 / null / exact fit / party larger than remaining seats / all-canceled. This is the highest-value test file in the repo.

- [ ] **`withEventLock` helper.** The transaction wrapper from `architecture.md#the-critical-section`: opens transaction, takes `FOR UPDATE` on the event row, snapshots derived statuses, runs callback, recomputes, diffs, enqueues status-change notifications, commits. Every queue mutation goes through it.
  - *Check:* a test proving two concurrent calls serialize rather than interleave.

- [ ] **Admin: single-event CRUD.** Create/edit/cancel one-off events. Fields: title, description, start, end, timezone, capacity (nullable), `max_guests_per_rsvp` (nullable), `signup_opens_at`, `general_location`, `exact_location`, `location_reveal_policy`. Deleting = `status: canceled`, not a row delete.
  - *Check:* admin can create an event and see it listed; a member cannot reach any of these endpoints.

- [ ] **Signup-open gating.** `signup_opens_at` enforced server-side inside the transaction. Before it opens, the event is visible with a countdown but the RSVP endpoint rejects with `SignupNotOpenError`.
  - *Check:* a request one second before open is rejected; one second after succeeds. Client clock manipulation has no effect.

- [ ] **Location gating in the serializer.** `lib/serializers/event.ts` decides what location fields ship to the client based on policy + current time + viewer role (admins always see full). The exact location must be **absent from the JSON**, not hidden in CSS.
  - *Check:* an integration test asserts the raw API response for a pre-reveal event contains no substring of `exact_location`.

- [ ] **RSVP create.** Inside `withEventLock`: verify signup open, event not canceled, user not banned, user has accepted current waiver, no existing active RSVP. Assign `queue_position` from `MAX + 1` under the lock. Reusing a previously canceled RSVP → create a **new** row at the back of the queue (re-signing up means going to the end; state this in the UI).
  - *Check:* concurrency test below.

- [ ] **RSVP cancel.** Sets `status: canceled`, `canceled_at`; row leaves the queue; boundary recomputes; anyone promoted is flagged for notification. No cutoff — allowed until event start (`policy.md#4`).
  - *Check:* with a full going list and a waitlist, canceling the first going RSVP promotes exactly the first waitlisted party and no one else.

- [ ] **Capacity change semantics.** `PATCH /events/:id` with a new capacity runs through `withEventLock`. Raising promotes from the top of the waitlist; lowering demotes from the bottom of going; `null` promotes everyone. No rows move — only the boundary.
  - *Check:* a test asserting exact membership before/after for raise, lower, and uncap.

- [ ] **Member event pages.** List of upcoming events (status, your RSVP state, seats remaining or "waitlist only"). Detail page showing going / waitlist / canceled lists by display name, your position if waitlisted, countdown to signup open, and location per gating policy. RSVP and cancel buttons.
  - *Check:* Playwright happy path — member logs in, opens event, RSVPs, sees themselves in going, cancels, disappears from going.

- [ ] **Admin event view.** Same detail page plus full location, phone numbers, and the ability to remove a member's RSVP (goes through `withEventLock` like any cancellation).
  - *Check:* admin-removed RSVP triggers the same promotion behavior as a self-cancel.

- [ ] **Event log writes.** Every queue mutation appends to `event_log` with actor, action, and payload.
  - *Check:* a signup → cancel → capacity change sequence produces three readable log rows.

## Exit criterion (hard gate)

A load script fires **50 concurrent RSVPs** at a capacity-24 event at the instant signup opens. Assertions, all of which must hold:

1. Exactly 24 people are "going," 26 are waitlisted.
2. `queue_position` values are unique and contiguous.
3. Ordering matches server receipt order.
4. No user appears twice.
5. No request returns a 500.

Then run one real volleyball night on it. Nothing ships to Phase 2 until a real night has run.

## Out of scope

Recurrence (Phase 2), +1s and approvals (Phase 2), SMS notifications (Phase 3 — Phase 1 only *enqueues* status changes, dispatch can be a no-op logger), admin dashboard, no-show tracking.
