# Notification manifest

What's actually wired up today, compiled from `prisma/schema.prisma`'s `NotificationType` enum, the four `enqueueNotification` call sites, `lib/notifications/`, and `docs/phase-3-polish.md`. 16 notification types total, all in-app (each also mirrored to web push if the user opted in). SMS was retired 2026-09-08. Compiled 2026-09-08.

## Live — wired to a real trigger, sending today

| Type | Fires when… | Source |
|---|---|---|
| `rsvp_promoted` | A seat opens and the next person in queue order moves to going | `lib/rsvp/with-event-lock.ts` |
| `rsvp_demoted` | A capacity drop pushes someone from going back to waitlist | `lib/rsvp/with-event-lock.ts` |
| `event_canceled` | Host cancels the event — every active RSVP holder | `lib/events/events.ts` |
| `event_updated` | Start time or location changes on an event people are RSVP'd to | `lib/events/events.ts` |
| `capacity_changed` | Capacity is edited — every active RSVP holder | `lib/events/events.ts` |
| `guest_approved` | Host approves a +1 — to the host who requested it | `lib/guests/guests.ts` |
| `guest_rejected` | Host rejects a +1 | `lib/guests/guests.ts` |
| `event_comment_posted` | A comment is posted on an event, to every active RSVP holder | `lib/comments/comments.ts` |
| `group_membership_approved` | Group admin approves a join request, to the requester | `lib/groups/groups.ts` |
| `group_membership_rejected` | Group admin declines a join request | `lib/groups/groups.ts` |
| `group_upgrade_requested` | Group admin requests a member-limit increase, to platform admins | `lib/groups/upgrade-requests.ts` |
| `group_upgrade_resolved` | Platform admin approves or declines that request, to the requester | `lib/groups/upgrade-requests.ts` |

## Built, not scheduled — code + tests exist, no cron is calling them

| Type | Fires when… | Source |
|---|---|---|
| `location_reveal` | Location reveal time passes, to the going list | `lib/notifications/jobs.ts` · `npm run job:location-reveal` |
| `day_before_reminder` | Day before the event, in the event's own timezone, to going + waitlist | `lib/notifications/jobs.ts` · `npm run job:day-before-reminder` |
| `signup_opened` | `signupOpensAt` passes, to every active group member who hasn't RSVP'd yet | `lib/notifications/jobs.ts` · `npm run job:signup-opened` |

## No trigger — type exists, nothing calls it

| Type | Status | Source |
|---|---|---|
| `waiver_reminder` | Storage + rendering exist, but no product decision on when it should fire | `lib/notifications/notifications.ts` |

## How delivery actually works

Every `Notification` row (`enqueueNotification`) is `channel: "in_app"` and stamped `sent` the instant it's created — the row *is* the notification, no external send step required for it to "count" as delivered.

1. Shown on `/notifications` with an unread-count badge on the nav bar's bell icon (every page) and `/home`; read state tracked per row.
2. If the user has opted in on `/settings`, the same row is separately, best-effort mirrored to their browser(s) as a web push notification — a 404/410 response deletes the dead subscription, any other failure just logs.
3. Push never touches `status`/`attempts` — those fields stay reserved for the legacy SMS retry path below.
4. Requires VAPID keys + per-device opt-in. Known gap: headless Chromium always reports permission "denied," so the subscribe flow's happy path isn't covered end-to-end — verify manually in a real browser.

## SMS — retired 2026-09-08, kept only to drain old rows

Four types (`rsvp_promoted`, `rsvp_demoted`, `event_canceled`, `event_updated`) used to enqueue as `channel: "sms"`, sent via Twilio's Messages API (`sendSms()` — a separate Twilio product from the Verify service used for OTP login, which is unaffected by this). `TWILIO_MESSAGING_SERVICE_SID` was never configured in any environment, so none of those texts had actually gone out before the switch — the cost/reliability tradeoff (a second Twilio product, STOP/HELP compliance, a retry queue) wasn't worth it for four notification types when in-app + push already covers the same ground for free.

`enqueueNotification` never creates a `sms`-channel row anymore. The dispatch/retry code path (`dispatchNotification`'s Twilio branch, `retryPendingNotifications`, the opt-out check against `User.smsOptedOutAt`) stays in `lib/notifications/notifications.ts` only so any row an older deploy already enqueued still drains normally — it's dead code for new traffic, not deleted because it costs nothing to leave in place and ripping it out isn't worth the migration risk (the `sms` `NotificationChannel` enum value and the `status`/`attempts`/`lastError` columns would need a schema change to remove).

**Follow-up worth doing, not done here**: `lib/auth/sms-consent.ts#SMS_MESSAGE_TYPES_DESCRIPTION` (shown at `/login` and gating `/api/auth/otp/send` — see `hasActiveSmsConsent`) describes the program as covering "your one-time login code, waitlist promotion/demotion alerts, and event cancellations or changes to time/location." The login-code half is still true and this checkbox must stay — it's a functional gate on OTP delivery, not just marketing copy — but the promotion/demotion/cancellation half is now inaccurate. Left untouched here since it's consent copy (bump `SMS_CONSENT_VERSION` if it's edited, per that file's own comment) rather than a notifications-routing change, but worth a deliberate copy pass.

## Known gaps

- **No scheduler is wired up (infra).** All four cron scripts (`job:retry-notifications`, `job:location-reveal`, `job:day-before-reminder`, `job:signup-opened`) run correctly and are tested — nothing calls them on an interval. Needs Vercel Cron or system cron, not new code. (`job:retry-notifications` now only ever has legacy `sms` rows to retry, if any exist.)
- **`waiver_reminder` has no trigger condition (product).** Rendering and storage exist end-to-end; needs a decision on exactly when it should fire (e.g. folded into the day-before job, checking for an unsigned required group waiver) before it can be implemented.
- **Push opt-in's happy path is untested in CI (verify manually).** Route-level tests cover subscribe/unsubscribe, but the actual browser permission prompt can't be exercised headlessly — confirm it manually before leaning on push in production.
- **Signup consent copy is stale** — see the SMS section above.
