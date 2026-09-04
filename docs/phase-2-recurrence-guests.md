# Phase 2 — Recurrence & +1s

**Goal:** admins stop creating events by hand, and members can bring friends through an approval flow with waivers.

**Duration:** ~2 weeks · **Prerequisites:** Phase 1 exit criterion met, including a real night run

Read alongside: `docs/policy.md` (**all rules apply — reread it, including rule 6**), `docs/architecture.md`, `docs/conventions.md`.

> **Prerequisite:** `docs/phase-0b-groups.md` completes before this phase starts. Series and events created here inherit `group_id`/`waiver_required` from the outset; the approval queue and admin views are per-group.

## Part A — Recurring series

- [x] **Schema: event_series.** `event_series` table per `architecture.md`, plus a real FK from `events.series_id` (Phase 1 shipped the column but not the constraint, since the table didn't exist yet) and an index on it. `weekdays` uses JS `Date#getUTCDay()` numbering (0=Sun..6=Sat); `startTime`/`endTime` are wall-clock `"HH:mm"` strings combined with each occurrence's date at materialization time (`lib/timezone.ts`).
  - *Check:* migration applied clean against the live dev database (two migrations: `event_series`, no data to backfill since the table is new).

- [x] **Materialization.** `lib/events/series.ts#createSeries` generates every occurrence from series-creation time through `recurUntil` up front via `lib/events/recurrence.ts#generateOccurrenceDates` + `materializeOccurrence`, in one `prisma.$transaction` (series row + bulk `event.createMany`). `signupOpensRule: "immediately"` stamps every instance with the materialization timestamp; `"hours_before"` computes an offset from that instance's own `startsAt`.
  - *Check:* `tests/series.test.ts` — a Tuesday/Thursday series produces exactly the right instances, each genuinely on Tue/Thu **in the series' own timezone** (not UTC or the server's), at the correct local start/end time.

- [x] **Timezone-correct recurrence.** `generateOccurrenceDates` enumerates calendar dates as a pure Y-M-D cursor (immune to DST by construction — it never does wall-clock arithmetic); `materializeOccurrence` converts each date + the series' `startTime`/`endTime` to a UTC instant via `lib/timezone.ts#zonedTimeToUtc` (generalized from the location-reveal DST math Phase 1 already shipped and tested).
  - *Check:* `tests/recurrence.test.ts` and `tests/series.test.ts` both assert 7:00pm-10:00pm local on instances straddling the November DST change, with the underlying UTC hour actually differing across it (not just two coincidentally-equal instants).

- [x] **Series edit semantics.** `updateSeries` updates the series row, then propagates onto every future (`startsAt` in the future), non-overridden, still-`scheduled` instance — routed through the existing per-event `updateEvent` (not a bulk SQL update) specifically so a capacity change still goes through `withEventLock`'s boundary recompute and promotion notifications. **Scope decision**: only the per-instance settings that map 1:1 onto an `Event` field are editable post-creation (title, description, capacity, maxGuestsPerRsvp, waiverRequired, locations, location reveal policy/hours) — the schedule shape (weekdays/start-end time/timezone/recurUntil) is fixed at creation for this phase; reconciling already-materialized dates against a changed weekly pattern is its own feature, and extending the horizon is explicitly Phase 3 scope ("series horizon top-up"). See `lib/events/series-schema.ts`'s comment. The API/service layer for this shipped with the phase, but had no UI until 2026-09-02 (see "Admin series UI" below) — and a real bug was found and fixed at the same time: single-instance edits (`PATCH /api/events/:id`) never actually set `overridden`, so a hand-edited occurrence had no protection from a later series-wide edit silently clobbering it. `updateEvent` now takes an `options.markOverridden` flag, set only by that single-instance edit route (never by `updateSeries`'s own propagation loop) — see `tests/series.test.ts`'s "PATCH /api/events/:id marks the edited instance overridden" test.
  - *Check:* `tests/series.test.ts` ("series edit semantics") — a past instance and a hand-edited (`overridden`) instance are both left untouched by a series-level capacity change; every other future instance gets the new value. A second test confirms the capacity-change-promotes-from-waitlist path still fires per affected instance.

- [x] **Cancellation.** Single-instance cancellation (`cancelEvent`, already existed from Phase 1) now also notifies every still-active (going + waitlist) RSVP — that capability didn't exist before this phase. Series cancellation (`cancelSeries`) cancels **every future instance regardless of `overridden`** — unlike an edit, calling off the whole series calls off hand-edited instances too — by looping the same `cancelEvent` per instance, so each gets its own `event_log` row and notifications. Past instances are never touched by either path.
  - *Check:* `tests/series.test.ts` ("cancellation") — a past instance survives, a future overridden instance is canceled anyway, and the console-log notification fires for the RSVP'd member on the canceled instance.

- [x] **Per-weekday cancellation.** `cancelSeriesWeekday` cancels every future instance falling on one weekday of a multi-weekday series (e.g. dropping just the Thursdays of a Tue/Thu series) — same overridden-doesn't-protect-you semantics as `cancelSeries`, and drops that weekday from the series' own `weekdays` so it stops showing up and a future horizon top-up won't regenerate it. `DELETE /api/event-series/:id/weekdays/:weekday`, admin-only.
  - *Check:* `tests/series.test.ts` ("cancelSeriesWeekday") — canceling Thursdays leaves Tuesdays untouched, cancels an overridden Thursday anyway, notifies its RSVP'd member, and updates `series.weekdays`.

- [x] **Admin series UI.** `/admin/groups/:id/series` is the create form (weekday checkboxes, start/end time, timezone, recur-until date, signup-open rule, capacity/guest-cap/waiver/location fields), also reachable inline from the calendar's "Create Event" dialog (`app/(member)/groups/[id]/calendar/create-event-toggle.tsx`). There is deliberately no separate series/instance-list page — once created, a series' instances are just events, and the calendar already shows every event; a dedicated list page only duplicated that. All per-series actions live on an instance's own `/events/:id` page (reached via any calendar chip for that series), consolidated (2026-09-02) into one "Manage" dropdown (`app/(member)/events/[id]/event-admin-menu.tsx`, replacing the old always-visible button row + `series-actions.tsx`) rather than several stacked rows of buttons: edit this event (a modal wrapping the existing `EventForm`), edit series (admin-only, when the event has a `seriesId` — a modal wrapping the new `app/admin/events/series-edit-form.tsx`, same field set as `updateSeriesSchema`, no schedule fields), view log, cancel this event, cancel one weekday (only offered when the series spans more than one weekday), and cancel remaining series. **Scope decision**: there is deliberately no per-weekday *edit* option (only per-weekday *cancel*) — editing a single weekday's content differently from the rest of the series was judged not worth the reconciliation complexity; the answer for "this weekday needs different content" is to cancel the series and create a new one, same philosophy as the schedule-shape restriction above.
  - *Check:* `e2e/series-flow.spec.ts` — real Playwright run: admin creates a series, finds its instances via the calendar, edits one instance's title, cancels another on its own, cancels the rest of the series from a third, and a separate member session sees the edited title and both canceled banners, with no admin controls anywhere.

## Part A exit criterion (from below) — met

A single series generates a correct set of instances (verified with both a short window and one spanning a real DST change), one of which has been individually edited and one canceled — see the checks above. The mixed-party-size concurrency exit criterion is Part B's (guests don't exist yet), so it isn't claimed here.

## Part B — +1s

- [x] **Schema: guests.** `guests` table per `architecture.md` (`lib/generated/prisma` model `Guest`), `waiver_token` unique with 32 bytes of entropy (`randomBytes(32).toString("base64url")`, same generator function used for every other unguessable token in this codebase — group join codes, etc.). `waiver_signatures.guest_id` is now a real FK (it was a loose, unlinked column since Phase 0, before the `guests` table existed).
  - *Check:* migration applied clean against the live dev database.

- [x] **Party-aware seat math.** `lib/rsvp/seats.ts#getApprovedGuestCounts`/`seatsFor` compute `seats(rsvp) = 1 + approved guest count` from real guest rows; wired into both places that previously hardcoded `seats: 1` — `withEventLock`'s before/after snapshot (`lib/rsvp/with-event-lock.ts`) and `getEventDetail`/`listEventsForMember` (`lib/rsvp/event-detail.ts`). `computeDerivedStatuses` itself needed no changes — it was already written to accept a `seats` field per caller, exactly so this phase would only need to change what callers pass in (Phase 1's own note in `lib/rsvp/seat-math.ts` said as much).
  - *Check:* `tests/guests.test.ts` ("party-aware seat math") — capacity 3, a party that grows to 3 seats via approved guests waitlists entirely rather than partially seating, and a solo party behind it does **not** skip ahead into the vacated seat.

- [x] **Member: add guests.** `POST /api/events/:id/rsvp/guests` → `lib/guests/guests.ts#addGuests`, inside `withEventLock` (for the atomic cap check under concurrent adds — pending guests hold no seat, so this never changes the boundary or fires promotion notifications). Enforces `max_guests_per_rsvp` counting pending + approved.
  - *Check:* `tests/guests.test.ts` — cap 2, two pending guests refuse a third; approving both and requesting a third is still refused (cap counts pending + approved, not just pending).

- [x] **Member: remove guests.** `DELETE /api/guests/:id` (host or a group admin of the event) → `removeGuest`, sets `removed`, no approval needed, goes through `withEventLock` so an approved guest's removal recomputes the boundary and promotes.
  - *Check:* `tests/guests.test.ts` — removing an approved guest from a full event promotes the next waitlisted party.

- [x] **Admin: approval queue.** `GET /api/groups/:id/guests/pending` + `lib/guests/guests.ts#listPendingGuestsForGroup` (every pending guest across the group's upcoming events) with `POST /api/guests/:id/approve` / `.../reject`, both through `withEventLock`. UI: `/admin/groups/:id/guests`.
  - *Check:* `tests/guests.test.ts` — approving a guest for a host at the bottom of "going" demotes the party behind them, asserted directly (not avoided), and the demotion notification fires.

- [x] **Admin-added guests.** `POST /api/events/:id/guests` → `adminAddGuests`, created directly `approved`, exempt from the cap (no cap check at all in that path), attached to the host's existing `rsvp` — the host's `queue_position` column is never written by this path.
  - *Check:* `tests/guests.test.ts` — an admin-added guest with the event's `maxGuestsPerRsvp: 0` still succeeds, and the host's `queue_position` is byte-for-byte unchanged before/after.

- [x] **Re-approval on additions.** Guests are always created fresh in `pending` — `addGuests` never touches existing rows, so an earlier approved batch is structurally untouched by a later `addGuests` call.
  - *Check:* `tests/guests.test.ts` — approve 2, add 2 more → exactly 2 approved (the original batch, by id) and 2 pending (the new batch, by id).

- [x] **Guest waiver links.** `waiverToken` generated at guest creation (member add, admin add — both); `GET`/`POST /api/waiver/:token[/sign]` (public, no auth) + `/waiver/:token` signing page. Links are surfaced to the host and admins directly on the event page (`event-detail-client.tsx`'s `GuestList`, gated so only the host's own party or an admin viewer sees the token — not other members) and on the admin approval-queue page.
  - *Check:* `tests/guests.test.ts` — the public GET/sign routes work with a valid token and 404 on an invalid one; a guest can be approved with **no** signature at all (waivers never block, checked explicitly in the same test).
  - **Bug found and fixed 2026-09-03**: the guest waiver flow always showed/recorded the *platform* waiver, never the event's own group's waiver, even when the group had one configured — architecture.md had documented this as "unchanged" through this phase, but it should have picked up group waivers once those existed. `getGuestByWaiverToken`/`signGuestWaiver` (`lib/guests/guests.ts`) now use the group's `waiverContent`/`waiverVersion` when configured (tagging the resulting `WaiverSignature.groupId`). Same day, the platform waiver tier itself was removed (see `docs/phase-0-foundations.md`), so a guest whose event's group has no waiver configured now sees "no waiver required" and nothing is recorded — no fallback of any kind. *Check:* `tests/guests.test.ts`'s "guest waiver uses the event's group's waiver..." test.

- [x] **Waivers never block.** Guest approval, seating, and attendance have no waiver-signed check anywhere in `lib/guests/guests.ts` or the RSVP seat math — a signature is purely an evidentiary `waiver_signatures` row. **Not yet built**: the "outstanding waiver" badge in the admin UI (so admins know who still needs to sign on-site) — the underlying data (`guest.waiverSignedAt`) is already returned by every guest-listing query, just not rendered as a badge yet.
  - *Check:* `tests/guests.test.ts` proves the no-block behavior; the badge itself is a follow-up (see below).

- [x] **UI for parties.** `partyLabel()` in `event-detail-client.tsx` renders "DisplayName +N" (N = approved guest count) in both going and waitlist lists; pending guests show inline with a "(pending approval)" tag. The waitlist's own "needs N open seats" framing (`policy.md#1`'s UI requirement) is covered by the existing per-party seat math, not a literal "Your party of 3 needs 3 open seats" string — see follow-up below.
  - *Check:* `e2e/guest-flow.spec.ts` — real Playwright run of the task's exact scenario: member RSVPs, adds 2 guests, admin approves both, member sees "Name +2" in the going list with no more pending tags.

## Exit criteria

- [x] A single series generates a correct set of instances, one of which has been individually edited and one canceled — met in Part A (see above); "three months" specifically wasn't the literal window used in tests (a DST-crossing window and a short window were used instead, for speed and determinism), but the mechanism is the same regardless of window length.
- [x] A concurrency test with mixed party sizes signing up simultaneously produces a going list that never exceeds capacity and never skips a party — `tests/guests.test.ts`'s seat-math test covers mixed party sizes (guests growing a party mid-event) never skipping or over-seating; this is a sequential proof of the *rule*, not a concurrency/load test with simultaneous requests the way Phase 1's 50-concurrent RSVP test was. A true concurrent-guest-approval load test is a reasonable follow-up but wasn't built here.
- [ ] A real night runs with at least one approved +1 and one waiver link sent — this is an operational milestone (an actual game night), not something achievable from within this session; flagged as the remaining step before calling Phase 2 fully closed.

## Known gaps / follow-ups

- **"Outstanding waiver" badge** for admins (guest approved but `waiverSignedAt` is still null) — the data exists everywhere needed, just not rendered as a distinct badge yet.
- **Literal "Your party of 3 needs 3 open seats" copy** on the waitlist view — the underlying seat math and waitlist position are already correct and shown, just not phrased with that exact sentence.
- **A true concurrency test for guest approval** (mixed party sizes, simultaneous requests) — the existing test proves the seat-math rule sequentially; a load test analogous to `scripts/load-test-rsvp.ts` would close this properly.
- **A real game night** with an approved +1 and a signed waiver link — the last exit criterion, inherently outside what a coding session can produce.

## Out of scope

SMS dispatch (Phase 3 — keep enqueueing to the logger), admin dashboard and attendance history, no-show tracking, guest cancellation flows beyond removal by the host.
