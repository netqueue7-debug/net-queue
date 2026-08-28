# Phase 2 — Recurrence & +1s

**Goal:** admins stop creating events by hand, and members can bring friends through an approval flow with waivers.

**Duration:** ~2 weeks · **Prerequisites:** Phase 1 exit criterion met, including a real night run

Read alongside: `docs/policy.md` (**all five rules apply — reread it**), `docs/architecture.md`, `docs/conventions.md`.

## Part A — Recurring series

- [ ] **Schema: event_series.** Per `architecture.md`. Add `series_id` and `overridden` to `events` if not already present from Phase 1.
  - *Check:* migration applies clean against a database with live Phase 1 events.

- [ ] **Materialization.** Creating a series generates every concrete `events` row up front (a 3-month window is ~30 rows — no rolling generation needed). Each instance derives its own `signup_opens_at` from the series' `signup_opens_rule` (an offset like "48 hours before start", or "immediately").
  - *Check:* "Tuesdays and Thursdays 7–10pm until Nov 30" produces the right count of instances with correct local times.

- [ ] **Timezone-correct recurrence.** Generate occurrences in the series' timezone, then convert to UTC. A 3-month window crosses a DST boundary; naive UTC arithmetic will silently shift events by an hour.
  - *Check:* a series spanning the November DST change keeps 7:00pm local on every instance.

- [ ] **Series edit semantics.** Editing a series updates future, **non-overridden** instances only. Editing a single instance sets `overridden = true`, permanently protecting it from series edits. Past instances are never modified.
  - *Check:* edit instance #3's capacity, then change the series capacity — instance #3 keeps its own value, others update.

- [ ] **Cancellation.** Cancel one instance (`status: canceled`, notify everyone on going + waitlist). Cancel a series → cancels all future instances, leaves past ones alone.
  - *Check:* canceling an instance with a populated queue notifies the right set and the event renders as canceled to members.

- [ ] **Admin series UI.** Create/edit form with weekday multi-select, time range, end date, and all the per-event settings (capacity, guest cap, signup-open rule, location policy) that instances inherit. Instance list with per-instance edit/cancel and an "edited" marker.
  - *Check:* Playwright — create a series, edit one instance, cancel another, verify member view reflects all three states.

## Part B — +1s

- [ ] **Schema: guests.** Per `architecture.md`, including `waiver_token` (unique, unguessable — 32+ bytes of entropy).
  - *Check:* migration clean; token collisions impossible by construction.

- [ ] **Party-aware seat math.** Extend `computeDerivedStatuses` so `seats(rsvp) = 1 + approved guest count`. Atomic parties, no skipping (`policy.md#1`).
  - *Check:* capacity 10 with 9 seats taken and a party of 2 next — the party waits, **and so does the solo player behind them**. The 10th seat stays empty. Test this exact case explicitly; it is the rule most likely to be "helpfully" broken.

- [ ] **Member: add guests.** At signup or after, via `POST /events/:id/rsvp/guests`. Creates `pending` rows that **hold no seats** (`policy.md#2`). Enforce `max_guests_per_rsvp` server-side inside the transaction, counting **pending + approved** (`policy.md#3`).
  - *Check:* with cap 2, a user with 2 pending guests is refused a third; approving both and then requesting a third is also refused.

- [ ] **Member: remove guests.** Removing sets `removed`. No approval needed. Frees seats immediately and recomputes the boundary.
  - *Check:* removing an approved guest from a full event promotes the next waitlisted party.

- [ ] **Admin: approval queue.** A view of pending guests across upcoming events with approve/reject. Approval runs in `withEventLock`: guest → `approved`, seats claimed at the **host's existing queue position**, boundary recomputes.
  - *Check:* approving a guest for a host at the bottom of "going" demotes the party behind them and flags them for notification. This is correct behavior — assert it rather than avoiding it.

- [ ] **Admin-added guests.** `POST /events/:id/guests` creates guests directly in `approved` state, exempt from `max_guests_per_rsvp`. **No queue jumping** — they attach to the host's existing position (`policy.md#5`).
  - *Check:* an admin-added guest does not change the host's `queue_position`.

- [ ] **Re-approval on additions.** Guests added after an earlier batch was approved are new `pending` rows; previously approved guests are untouched.
  - *Check:* approve 2, add 2 more → exactly 2 pending, 2 approved, boundary reflects only the approved 2.

- [ ] **Guest waiver links.** On guest creation, generate `/waiver/{token}` and deliver the links to the host (and surface them to admins on the event page). Public signing page: guest enters name, accepts, `waiver_signed_at` recorded.
  - *Check:* an unauthenticated browser can open a valid token and sign; an invalid token 404s.

- [ ] **Waivers never block.** Unsigned guest waivers do not block approval, promotion, or attendance — show an "outstanding waiver" badge to admins so they can collect onsite (`policy.md` derived rules).
  - *Check:* a guest with no signature can still be approved and appear in the going list, flagged.

- [ ] **UI for parties.** Going/waitlist lists render parties as a unit ("Sam +2"). Waitlisted users see why: "Your party of 3 needs 3 open seats."
  - *Check:* Playwright — member RSVPs with 2 guests, admin approves, member sees the party in the going list.

## Exit criteria

- A single series generates three months of correct instances, one of which has been individually edited and one canceled.
- A concurrency test with mixed party sizes signing up simultaneously produces a going list that never exceeds capacity and never skips a party.
- A real night runs with at least one approved +1 and one waiver link sent.

## Out of scope

SMS dispatch (Phase 3 — keep enqueueing to the logger), admin dashboard and attendance history, no-show tracking, guest cancellation flows beyond removal by the host.
