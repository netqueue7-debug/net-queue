# Phase 3 — Polish & Operations

**Goal:** the system runs itself. People find out they got in without checking the site, admins have the tools to settle disputes, and you have a runbook.

**Duration:** ~1–2 weeks, then ongoing · **Prerequisites:** Phase 2 complete

Read alongside: `docs/architecture.md` (notifications), `docs/conventions.md`.

## Tasks

- [x] **Notification dispatcher.** `Notification` table (schema: `type`, `channel`, `status`, `payload`, `attempts`, `lastError`, `readAt`) backs both SMS and in-app. `lib/notifications/notifications.ts#enqueueNotification` writes the row inside the caller's transaction (`withEventLock`, `cancelEvent`, guest approve/reject); `dispatchNotification` sends it after commit. **Scope decision on idempotency**: rather than a permanent unique constraint on `(user_id, event_id, notification_type)` — which would silently drop legitimate repeat notifications (a second guest approved for the same host, a second capacity change) — idempotency is per-row via `status`: a `sent` row is never re-sent, which is what actually makes "a retry never double-texts" true. A Twilio failure updates `attempts`/`lastError` and leaves the row `pending` (retryable) until `MAX_ATTEMPTS` (5), never touching the queue mutation that created it.
  - *Check:* `tests/notifications.test.ts` — a mocked Twilio failure leaves the row `pending` with `attempts: 1` and the triggering mutation committed regardless; re-dispatching an already-`sent` row doesn't call `sendSms` again; a row exhausts to `failed` after 5 attempts.

- [x] **SMS: the moments that matter.** `lib/notifications/notifications.ts`'s `SMS_TYPES` set — exactly these three, everything else is in-app:
  - Promoted from waitlist to going (enqueued inside `withEventLock`'s existing boundary diff, `lib/rsvp/with-event-lock.ts`)
  - Event canceled (enqueued inside `cancelEvent`'s transaction, `lib/events/events.ts`, for every still-active RSVP)
  - Demoted from going to waitlist (same diff as promotion — not silent, same code path)
  - *Check:* `tests/with-event-lock.test.ts`, `tests/guests.test.ts`, `tests/series.test.ts` each assert the right `Notification` row exists after a real promotion/demotion/cancellation (rewritten from Phase 1/2's console.log-spy assertions, which this phase's real dispatcher made obsolete).

- [x] **In-app notifications for everything else.** Guest approved/rejected (`lib/guests/guests.ts#approveGuest`/`rejectGuest`, to the host), capacity changes (`lib/events/events.ts#updateEvent`'s capacity branch, to every active RSVP holder). In-app rows are stamped `sent` at creation — there's no external delivery step, the row *is* the notification. `waiver_reminder` exists as a type but nothing enqueues it yet — its trigger condition wasn't specified precisely enough to implement without guessing; flagged as a follow-up below rather than guessed at.
  - *Check:* `tests/notifications.test.ts` — list/unread-count/mark-read/mark-all-read all round-trip correctly. UI: `/notifications` (list + mark read) and an unread-count link on `/home`.

- [x] **Scheduled jobs (cron).** `lib/notifications/jobs.ts`, run via `npm run job:*` (intended for an external scheduler — Vercel Cron, system cron, etc.; none is wired up yet, see follow-ups):
  - Location reveal notification to the going list, the moment `serializeEvent`'s own reveal-time calculation (`lib/serializers/event.ts#locationRevealAt`, exported for reuse) passes. `always`-policy events are skipped — there's no reveal moment to notify about.
  - Day-before reminder to going + waitlist, computed in **the event's own timezone** (not the server's or UTC) via `lib/timezone.ts#zonedDateString`.
  - Series horizon top-up: **not built** — explicitly out of scope until a series' initial window is actually extended (docs/phase-2-recurrence-guests.md never built horizon extension either), so there's nothing to top up yet.
  - *Check:* `tests/notification-jobs.test.ts` — both jobs are idempotent (a second run sends nothing for the same user+event); the day-before job is proven to use the event's timezone, not the test runner's, via an America/Los_Angeles event.

- [x] **Admin dashboard.** `/admin/groups/:id/dashboard` (`lib/admin/dashboard.ts`) — upcoming events with fill rate, pending guest count, and outstanding-waiver count (approved guests with no signature — the "outstanding waiver" badge from `policy.md`'s derived rules, not built until now) per event, plus group-wide pending-membership/pending-guest counts. Attendance history per member: `/admin/groups/:id/members/:userId` (`lib/admin/attendance.ts`), recomputing derived status per past RSVP at read time (never stored, same invariant as the live queue). Ban/unban: `POST /api/users/:id/ban[-preview]`/`unban`, wired into the memberships page (`ban-unban-button.tsx`).
  - **Scope note on ban's reach**: `banned_at` is global, not per-group — `docs/phase-0b-groups.md` explicitly deferred per-group ban lists, and `createRsvp`'s own ban check is equally global, so banning necessarily cancels the user's upcoming RSVPs *everywhere*, not just in the acting admin's group. To keep this from being exercisable by an unrelated admin, `lib/groups/authz.ts#assertCanModerateUser` requires the actor to be a platform admin **or** a group admin of some group the target is an active member of.
  - *Check:* `tests/moderation.test.ts` — the ban-preview endpoint returns exactly the RSVPs a ban would cancel, matching what the confirm dialog shows before the actual `POST /ban`; an admin with no shared group with the target gets 403.
  - *Check:* `tests/moderation.test.ts` — after ban, the RSVP is explicitly `canceled` (not silently flagged) and a new RSVP attempt throws `UserBannedError`; after unban, a new RSVP succeeds as a fresh row at the back of the queue — the old (canceled) row and its `queuePosition` are never touched or reused.
  - *Check:* `tests/admin-dashboard.test.ts` — fill rate, pending-guest, and outstanding-waiver counts all match a hand-verified scenario (one pending guest, one approved-but-unsigned guest).

- [x] **Event log viewer.** `lib/admin/event-log.ts#getEventLogTimeline` reads `event_log` (append-only since Phase 1, no new write-path) and renders each row as a human sentence rather than a raw payload — resolving actor names, and for actions keyed by `rsvpId`/`guestId` (cancel, guest approve/reject/remove) specifically naming *whose* RSVP/guest was affected when that's a different person from the actor (an admin removing someone else's RSVP reads "Admin removed Member's RSVP," not "Admin canceled their RSVP"). `GET /api/events/:id/log` + `/events/:id/log` page, linked from the event page's admin controls. "Searchable" is satisfied by the browser's own find-in-page over what's already a short, linear, chronological list — no separate search index was built.
  - *Check:* `tests/event-log-timeline.test.ts` — a full sequence (signup, capacity change, guest add, guest approve, admin-added guest, admin-removal-of-someone-else's-RSVP) reads back in the exact right order with the exact right human sentences, including correctly naming the RSVP's owner (not the actor) on the removal.

- [ ] **Mobile UX pass.** Everyone will use this on a phone at the gym. Big tap targets, RSVP button reachable without scrolling, list views readable one-handed.
  - *Check:* Playwright mobile viewport run of both happy paths.

- [ ] **Ops runbook** (`docs/runbook.md`): automated backups verified by an actual restore, how to promote an admin, how to manually fix a queue position (with the `withEventLock` helper, never raw SQL), Twilio spend alerts, error monitoring (Sentry), and what to do if OTP delivery breaks on game night.
  - *Check:* someone other than the author can follow it to restore a backup.

## Known gaps / follow-ups (notifications)

- **`waiver_reminder` has no trigger.** The type, rendering, and storage all exist; nothing calls `enqueueNotification` with it yet. Needs a product decision on exactly when it should fire (e.g. day-before reminder job also checking for an unsigned *required* group waiver) before implementing — see `docs/policy.md#6`'s group-waiver-required rule for the underlying mechanism it would check.
- **Cron jobs aren't wired to a real scheduler.** `npm run job:retry-notifications`/`job:location-reveal`/`job:day-before-reminder` exist and are tested, but nothing calls them on a schedule yet (Vercel Cron, system cron, etc.) — that's an infra/deploy step, not code.
- **`TWILIO_MESSAGING_SERVICE_SID` is not yet configured** in any environment (dev or prod) — until it is, every SMS attempt fails and retries harmlessly (by design), so promotion/demotion/cancellation texts won't actually go out. Setting this up is a manual Twilio Console step, covered in the ops runbook once it's written.
- **Series horizon top-up**: not built (see above) — no series has yet needed its window extended.

## Deferred deliberately

Payments · QR/check-in at the door · no-show tracking and reliability scores · multiple concurrent gyms/venues · native apps · public event pages for non-members.

All of these fit the existing model without schema upheaval. Revisit only if the group actually asks for them — most pickup groups never need any of it.
