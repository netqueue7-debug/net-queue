# Notification manifest

What's actually wired up today, compiled from `prisma/schema.prisma`'s `NotificationType` enum, the four `enqueueNotification` call sites, `lib/notifications/`, and `docs/phase-3-polish.md`. 16 notification types total: 4 ride SMS, 12 are in-app (each also mirrored to web push if the user opted in). Compiled 2026-09-04.

## Live — wired to a real trigger, sending today

| Type | Channel | Fires when… | Source |
|---|---|---|---|
| `rsvp_promoted` | SMS | A seat opens and the next person in queue order moves to going | `lib/rsvp/with-event-lock.ts` |
| `rsvp_demoted` | SMS | A capacity drop pushes someone from going back to waitlist | `lib/rsvp/with-event-lock.ts` |
| `event_canceled` | SMS | Host cancels the event — every active RSVP holder | `lib/events/events.ts` |
| `event_updated` | SMS | Start time or location changes on an event people are RSVP'd to | `lib/events/events.ts` |
| `capacity_changed` | In-app | Capacity is edited — every active RSVP holder | `lib/events/events.ts` |
| `guest_approved` | In-app | Host approves a +1 — to the host who requested it | `lib/guests/guests.ts` |
| `guest_rejected` | In-app | Host rejects a +1 | `lib/guests/guests.ts` |
| `event_comment_posted` | In-app | A comment is posted on an event, to every active RSVP holder | `lib/comments/comments.ts` |
| `group_membership_approved` | In-app | Group admin approves a join request, to the requester | `lib/groups/groups.ts` |
| `group_membership_rejected` | In-app | Group admin declines a join request | `lib/groups/groups.ts` |
| `group_upgrade_requested` | In-app | Group admin requests a member-limit increase, to platform admins | `lib/groups/upgrade-requests.ts` |
| `group_upgrade_resolved` | In-app | Platform admin approves or declines that request, to the requester | `lib/groups/upgrade-requests.ts` |

## Built, not scheduled — code + tests exist, no cron is calling them

| Type | Channel | Fires when… | Source |
|---|---|---|---|
| `location_reveal` | In-app | Location reveal time passes, to the going list | `lib/notifications/jobs.ts` · `npm run job:location-reveal` |
| `day_before_reminder` | In-app | Day before the event, in the event's own timezone, to going + waitlist | `lib/notifications/jobs.ts` · `npm run job:day-before-reminder` |
| `signup_opened` | In-app | `signupOpensAt` passes, to every active group member who hasn't RSVP'd yet | `lib/notifications/jobs.ts` · `npm run job:signup-opened` |

## No trigger — type exists, nothing calls it

| Type | Channel | Status | Source |
|---|---|---|---|
| `waiver_reminder` | In-app | Storage + SMS/push rendering exist, but no product decision on when it should fire | `lib/notifications/notifications.ts` |

## How each channel actually delivers

Both channels share the same `Notification` row (`enqueueNotification`); the channel decides what happens to it after creation.

**SMS**
1. The row is written inside the same transaction as the queue mutation, but the actual send happens strictly after commit — a failed text never rolls back a promotion.
2. Sent via Twilio's Messages API through `sendSms()` — a separate Twilio product from the Verify service used for OTP login.
3. On failure the row stays `pending` with `attempts`/`lastError` recorded; `job:retry-notifications` sweeps rows older than 2 minutes and retries up to 5 attempts before marking `failed`.
4. Bodies are deliberately short and never repeat the exact address — location stays behind its own reveal gate even in a text.
5. Requires `TWILIO_MESSAGING_SERVICE_SID`. Unset → every send throws and degrades into the retry queue.

**In-app (+ push mirror)**
1. The row *is* the notification — stamped `sent` the instant it's created. No external step is required for it to "count" as delivered.
2. Shown on `/notifications` with an unread-count badge on `/home`; read state tracked per row.
3. If the user has opted in on `/settings`, the same row is separately, best-effort mirrored to their browser(s) as a push notification — a 404/410 response deletes the dead subscription, any other failure just logs.
4. Push never touches `status`/`attempts` — those fields stay reserved for SMS retry tracking.
5. Requires VAPID keys + per-device opt-in. Known gap: headless Chromium always reports permission "denied," so the subscribe flow's happy path isn't covered end-to-end — verify manually in a real browser.

## Known gaps

- **STOP/HELP opt-out webhook needs Twilio console configuration (infra).** `app/api/webhooks/twilio/sms/route.ts` records STOP/START replies against `User.smsOptedOutAt` (checked by `dispatchNotification` before every SMS send, and by the login consent gate in `lib/auth/sms-consent.ts`), but nothing points Twilio at it yet — set it as `TWILIO_MESSAGING_SERVICE_SID`'s "Incoming Messages" webhook in the Twilio console, and confirm whether Advanced Opt-Out is enabled on that Messaging Service (it may already auto-handle STOP/HELP/START at Twilio's layer independent of this webhook).
- **No scheduler is wired up (infra).** All four cron scripts (`job:retry-notifications`, `job:location-reveal`, `job:day-before-reminder`, `job:signup-opened`) run correctly and are tested — nothing calls them on an interval. Needs Vercel Cron or system cron, not new code.
- **`waiver_reminder` has no trigger condition (product).** Rendering and storage exist end-to-end; needs a decision on exactly when it should fire (e.g. folded into the day-before job, checking for an unsigned required group waiver) before it can be implemented.
- **Push opt-in's happy path is untested in CI (verify manually).** Route-level tests cover subscribe/unsubscribe, but the actual browser permission prompt can't be exercised headlessly — confirm it manually before leaning on push in production.
