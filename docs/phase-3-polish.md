# Phase 3 — Polish & Operations

**Goal:** the system runs itself. People find out they got in without checking the site, admins have the tools to settle disputes, and you have a runbook.

**Duration:** ~1–2 weeks, then ongoing · **Prerequisites:** Phase 2 complete

Read alongside: `docs/architecture.md` (notifications), `docs/conventions.md`.

## Tasks

- [ ] **Notification dispatcher.** Replace the Phase 1/2 logger no-op with real delivery. Enqueued inside the transaction, dispatched **after commit**. Idempotent by `(user_id, event_id, notification_type)` so a retry never double-texts. A Twilio failure logs and retries; it never rolls back a queue mutation.
  - *Check:* forcing a Twilio error leaves the queue mutation committed and the notification retried.

- [ ] **SMS: the moments that matter.** Keep the list short to control cost.
  - Promoted from waitlist to going ("You're in for Tuesday 7pm")
  - Event canceled
  - Demoted from going to waitlist (rare but must never be silent)
  - *Check:* each fires exactly once per crossing, with correct local times.

- [ ] **In-app notifications for everything else.** Guest approved/rejected, waiver reminders, capacity changes. No SMS.
  - *Check:* unread indicator clears correctly.

- [ ] **Scheduled jobs (cron).**
  - Location reveal notification at reveal time to the going list
  - Day-before reminder to going + waitlist
  - Series horizon top-up if you later extend beyond the initial window
  - *Check:* jobs are idempotent — running one twice sends nothing twice.

- [ ] **Admin dashboard.** Upcoming events at a glance (fill rate, pending approvals, outstanding waivers), attendance history per member, and a ban/unban tool (`banned_at` blocks new RSVPs; existing ones are canceled explicitly, not silently). Unban clears `banned_at` and does not restore or re-queue any RSVPs that were canceled at ban time — the user simply becomes eligible to sign up again, at the back of the queue like anyone else.
  - *Check:* banning a user with an active RSVP shows the admin what will happen before confirming.
  - *Check:* unbanning a previously banned user allows a new RSVP but does not resurrect their old queue position.

- [ ] **Event log viewer.** Searchable per-event timeline from `event_log`: who signed up when, who was promoted, who changed capacity. This is what settles "I was definitely before her" arguments.
  - *Check:* a full night's activity reads as a coherent timeline.

- [ ] **Mobile UX pass.** Everyone will use this on a phone at the gym. Big tap targets, RSVP button reachable without scrolling, list views readable one-handed.
  - *Check:* Playwright mobile viewport run of both happy paths.

- [ ] **Ops runbook** (`docs/runbook.md`): automated backups verified by an actual restore, how to promote an admin, how to manually fix a queue position (with the `withEventLock` helper, never raw SQL), Twilio spend alerts, error monitoring (Sentry), and what to do if OTP delivery breaks on game night.
  - *Check:* someone other than the author can follow it to restore a backup.

## Deferred deliberately

Payments · QR/check-in at the door · no-show tracking and reliability scores · multiple concurrent gyms/venues · native apps · public event pages for non-members.

All of these fit the existing model without schema upheaval. Revisit only if the group actually asks for them — most pickup groups never need any of it.
