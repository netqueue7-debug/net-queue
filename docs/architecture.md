# Architecture

## Shape of the system

One Next.js monolith, one Postgres database, one background job runner. At this scale (hundreds of users, tens of events) anything more is overhead.

```
Browser (React)
   └── Next.js app
        ├── auth/          Twilio Verify OTP → session cookie
        ├── groups/        group CRUD, join codes, membership, approval
        ├── events/        CRUD, recurrence, capacity, reveal policy — all group-scoped
        ├── rsvp/          queue engine — THE critical section
        ├── waivers/       group-scoped acceptance records, tokenized guest links
        ├── notifications/ SMS on promotion, approval, cancellation
        └── jobs/          cron: materialize series, reveals, reminders
   └── PostgreSQL · Twilio Verify + SMS
```

## Groups & tenancy

A **group** is the tenant boundary. Every event series, event, RSVP, and waiver belongs to exactly one group, and a user can only see or act on a group's data through an **active membership** in that group.

- **Two tiers: platform admin and group admin.** `User.role` (`member|admin`) from Phase 0 is repurposed as a rare **platform admin** tier — ops-only, for the people operating the deployment. Unlike a plain member, a platform admin has **full administrative control over every group**, with no membership row required in each one (`lib/groups/authz.ts#resolveGroupMembership` is the single place this override lives — every group-authz check funnels through it). Day-to-day admin-ness is **per group**, stored on `group_memberships.role`: a user can be an admin of one group and an ordinary member of another, and that authority never crosses into a group they don't administer. Platform admin is for setup/support/cross-group intervention; group admin is for actually running a group.
- **Join policy is per group**, not global: `open` — a valid join code activates membership immediately; `approval` — the same join code creates a `pending` membership that a group admin must approve before the user sees any of that group's events. This reuses the existing guest-approval pattern (pending → admin decision → active) rather than inventing a new one.
- **Discovery is by join code, not a directory.** Groups aren't publicly listable (`docs/policy.md`'s privacy rule extends to group existence, not just phone numbers). A group admin generates/shares `groups.join_code` out of band (text, link).
- **One link works for both a brand-new phone number and an already-registered one.** `/join/:code` is the entry point regardless of auth state. An unauthenticated visitor is sent through login (OTP) and, if they've never onboarded, `display_name` + platform waiver, then redirected back to `/join/:code` to actually create the membership — the join code must survive that whole detour (session-backed `next` redirect, not a query param that a login form might drop). An already-authenticated, already-onboarded visitor hits `/join/:code` and joins immediately, no detour. This is one link to hand out in a group chat, not two.
- **Group creation is not self-serve.** For now, `POST /groups` requires the platform admin role (`users.role = admin`), not just any authenticated user — creating a group is an operational/sales action ("someone asks us to set them up"), gated the same way `npm run admin:promote` already gates the first platform admin. Whoever is designated as that group's admin is assigned by the platform admin at creation time (or promoted afterward via the group's own membership-role endpoint once it exists). This is a deliberate, revisitable restriction — see `docs/phase-0b-groups.md` — not a permanent architectural constraint; self-serve group creation can be opened up later behind its own decision (e.g. rate limits, abuse review) without a schema change.
- **Visibility.** `GET /events` and every event/RSVP read filters by the caller's *active* group memberships. No active membership in a group → that group's events don't exist as far as the API is concerned. Admin-only fields (unfiltered listings, pre-reveal location) additionally require `group_memberships.role = admin` in that specific group. Phone numbers are not among these — no viewer, admin included, ever sees another member's number (see "Privacy" under Cross-cutting concerns).
- **Two separate waivers, not one replaced by the other.** Phase 0's platform waiver (`users.waiver_accepted_at`/`waiver_version`, gating onboarding/basic app access) is untouched — everyone accepts it once, regardless of group. This feature adds a **second, independent, group-scoped waiver**: each group optionally owns its own waiver text/version, accepted per `(user, group)` on the membership row. A user can have accepted the platform waiver, group A's waiver, and not group B's, all at once.
- **Group waiver *requirement* is per event/series**, layered on top: a group can mark specific series/events `waiver_required = true`. When true, RSVP creation additionally gates on that group's current waiver version being accepted by the member's membership row — on top of, not instead of, Phase 1's existing platform-waiver check. When a group has no waiver content configured, `waiver_required` simply can't be set true for its events (nothing to gate on).
- **The queue engine and critical section are unchanged** — locking, seat math, and status derivation are still per-event and group-agnostic; group scoping is entirely an authorization/visibility layer in front of them, not a change to `withEventLock`.

## The core idea: one queue, not three lists

The UI shows "going," "waitlist," and "canceled." The database stores **a single FIFO queue of RSVPs per event**, ordered by `queue_position`.

- **going** = the prefix of active RSVPs whose cumulative seats fit under capacity
- **waitlist** = everything after that boundary
- **canceled** = RSVPs flagged out of the queue, retained for display

Every hard requirement collapses into "recompute the boundary":

| Event | What happens |
|---|---|
| Someone cancels | Row leaves the queue; boundary shifts down; next party is now going |
| Admin raises capacity | Boundary shifts down; waitlisted parties promote |
| Admin lowers capacity | Boundary shifts up; bottom of going demotes |
| Guest approved | That RSVP now consumes more seats; boundary shifts up |
| Guest removed | Frees seats; boundary shifts down |

Nothing ever "moves between lists." Status is computed, not stored.

**Detecting status changes for notifications:** compute the derived status map *before* and *after* each mutation inside the same transaction, diff them, and enqueue notifications for anyone who crossed the boundary in either direction.

## Seat math

```
seats(rsvp) = 1 + count(guests where approval_status = 'approved')

walk active RSVPs in queue_position order, accumulating seats:
  if running_total + seats(rsvp) <= capacity  → going
  else                                        → waitlist  (and every party after it also waitlists — no skipping)
capacity = null → everyone going
```

The no-skip rule (see `policy.md#1`) means the walk **stops promoting at the first party that doesn't fit** — it does not continue looking for smaller parties.

## The critical section

When a popular event opens, dozens of requests arrive in the same second. Every mutation that touches the queue — `createRsvp`, `cancelRsvp`, `approveGuest`, `removeGuest`, `updateCapacity` — must run inside a single transaction that first takes a **per-event lock**:

```
BEGIN
  SELECT ... FROM events WHERE id = $1 FOR UPDATE   -- or pg_advisory_xact_lock(event_id)
  validate (signup open? user eligible? cap respected?)
  snapshot derived statuses
  mutate
  recompute derived statuses, diff, enqueue notifications
COMMIT
```

Serializing writes per event is entirely fine here — worst case is tens of writes per second on one row. This single pattern eliminates every race condition in the system: double-signup, two people claiming the last seat, promotion racing a cancellation.

`queue_position` is assigned inside this transaction from a per-event counter (or `MAX(queue_position) + 1` under the lock, which is safe *because* of the lock).

## Data model

**users** — `id, phone (unique), display_name, role (member|admin — platform-level, ops only, see "Groups & tenancy"), waiver_accepted_at, waiver_version, banned_at, created_at`

- `waiver_accepted_at`/`waiver_version` are unchanged from Phase 0: the platform onboarding waiver, one per user, independent of group membership.

**groups** — `id, name, join_policy (open|approval), join_code (unique, unguessable), waiver_content (nullable text), waiver_version (nullable int), created_by, created_at`

- `waiver_content`/`waiver_version` are nullable — a group that never sets them simply can't require its own waiver on any event (see `waiver_required` below).

**group_memberships** — `id, group_id, user_id, role (member|admin), status (active|pending), group_waiver_accepted_at (nullable), group_waiver_version_accepted (nullable), joined_at` · unique `(group_id, user_id)`

- These `group_waiver_*` fields are a **second, independent** acceptance record from `users.waiver_accepted_at` — the group's own waiver, not the platform one. A user can accept the platform waiver once and then separately accept (or not) each group's waiver as they join.
- `banned_at` stays on `users` (global) for Phase 0's ban tool; a future per-group ban is a `group_memberships` addition, not built yet — out of scope for this change.

**event_series** — `id, group_id, title, description, general_location, exact_location, location_reveal_policy, capacity, max_guests_per_rsvp, waiver_required, signup_opens_rule, weekdays[], start_time, end_time, recur_until, timezone, created_by`

**events** — `id, group_id, series_id (nullable), title, description, starts_at, ends_at, capacity (nullable = uncapped), max_guests_per_rsvp (nullable = unlimited), waiver_required, signup_opens_at, general_location, exact_location, location_reveal_policy, status (scheduled|canceled), overridden (bool), timezone`

- `group_id` is denormalized onto `events` (not derived only through `series_id`) so one-off events (no series) still scope cleanly and every RSVP/queue query can filter by group with a single join.
- `waiver_required` defaults from the series to the instance, overridable per instance — same pattern as `capacity` and `max_guests_per_rsvp`.

- Duration ("total hours") is **derived** from start/end, never stored.
- `overridden` marks hand-edited instances so a series edit doesn't clobber them (the Google Calendar "this event vs. all following" model).

**rsvps** — `id, event_id, user_id, queue_position, status (active|canceled), canceled_at, created_at` · unique `(event_id, user_id)`

**guests** — `id, rsvp_id, name (nullable), added_by_role (user|admin), approval_status (pending|approved|rejected|removed), approved_by, approved_at, waiver_token (unique), waiver_signed_at`

- One row per guest, so "user adds 2 more after 2 were approved" is just two new pending rows; earlier approvals untouched.

**waiver_signatures** — `id, group_id (nullable), waiver_version, signer_type (user|guest), user_id, guest_id, signed_at, ip`

- Kept as the append-only evidentiary record (dispute resolution, audit) even though the live "has this user accepted the current version" check reads a fast-path field directly (`users.waiver_accepted_at` for the platform waiver, `group_memberships.group_waiver_accepted_at` for a group's) — same split Phase 0 already had.
- `group_id` is `null` for a platform-waiver signature (Phase 0's original rows stay valid unchanged) and set for a group-waiver signature.

**event_log** — `id, actor_user_id, event_id, action, payload (jsonb), created_at` · append-only; invaluable when someone disputes their queue spot.

## API surface

Auth: `POST /auth/otp/send` · `POST /auth/otp/verify` · `POST /auth/logout`

Groups (member): `GET /groups` (mine, active) · `POST /groups/join` (body: join code — also the target of the `/join/:code` page's own submit, after any login/onboarding detour) · `GET /groups/:id/waiver` · `POST /groups/:id/waiver/accept`

Groups (platform admin only): `POST /groups` — group creation is not self-serve; see "Groups & tenancy."

Groups (group admin, on an existing group): `PATCH /groups/:id` · `GET /groups/:id/memberships` · `POST /groups/:id/memberships/:userId/approve` · `POST /groups/:id/memberships/:userId/reject` · `PATCH /groups/:id/memberships/:userId` (role change) · `POST /groups/:id/join-code/rotate`

Member (all group-scoped by `:groupId` in path or by the event's own `group_id`): `GET /groups/:groupId/events` · `GET /events/:id` · `POST /events/:id/rsvp` · `DELETE /events/:id/rsvp` · `POST /events/:id/rsvp/guests` · `DELETE /guests/:id`

Admin (requires `group_memberships.role = admin` on the event's group, **or** platform admin): `POST /groups/:groupId/events` · `POST /groups/:groupId/event-series` · `PATCH /events/:id` · `PATCH /event-series/:id` · `DELETE /events/:id` · `POST /guests/:id/approve` · `POST /guests/:id/reject` · `POST /events/:id/guests` (admin-added) · `PATCH /users/:id` (platform admin only — no group-admin equivalent for platform-level user fields)

Public: `GET /waiver/:token` · `POST /waiver/:token/sign` (guest waivers, unchanged)

## Cross-cutting concerns

**Timezones.** Store UTC, render in the event's stored timezone. Recurrence math must be timezone-aware — a 3-month window crosses DST and naive date arithmetic will shift events by an hour.

**Location gating.** Evaluated server-side at serialization time, per policy: `always` → full; `hours_before:N` / `day_of` → `general_location` + a "reveals at" timestamp until the moment passes; `hidden` → nothing until day-of. The exact location must not appear in the API response before its reveal time.

**Privacy.** Members see display names only. Phone numbers are never surfaced on any RSVP/event/membership list, including to admins — an admin who needs to reach someone does so through the app's own notification channel, not by looking up a number. (The admin's own phone-based OTP flows, and a member's own number on their own `/settings` page, are unaffected — this rule is about *other people's* numbers.) A group's existence, membership list, and events are invisible to anyone without an active membership in it.

**Notifications.** SMS only for the moments that matter (waitlist promotion, event canceled). Everything else in-app, to control Twilio cost. Promotion SMS must be idempotent and best-effort — a failed send never rolls back the queue mutation.
