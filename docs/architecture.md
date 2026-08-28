# Architecture

## Shape of the system

One Next.js monolith, one Postgres database, one background job runner. At this scale (hundreds of users, tens of events) anything more is overhead.

```
Browser (React)
   └── Next.js app
        ├── auth/          Twilio Verify OTP → session cookie
        ├── events/        CRUD, recurrence, capacity, reveal policy
        ├── rsvp/          queue engine — THE critical section
        ├── waivers/       acceptance records, tokenized guest links
        ├── notifications/ SMS on promotion, approval, cancellation
        └── jobs/          cron: materialize series, reveals, reminders
   └── PostgreSQL · Twilio Verify + SMS
```

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

**users** — `id, phone (unique), display_name, role (member|admin), waiver_accepted_at, waiver_version, banned_at, created_at`

**event_series** — `id, title, description, general_location, exact_location, location_reveal_policy, capacity, max_guests_per_rsvp, signup_opens_rule, weekdays[], start_time, end_time, recur_until, timezone, created_by`

**events** — `id, series_id (nullable), title, description, starts_at, ends_at, capacity (nullable = uncapped), max_guests_per_rsvp (nullable = unlimited), signup_opens_at, general_location, exact_location, location_reveal_policy, status (scheduled|canceled), overridden (bool), timezone`

- Duration ("total hours") is **derived** from start/end, never stored.
- `overridden` marks hand-edited instances so a series edit doesn't clobber them (the Google Calendar "this event vs. all following" model).

**rsvps** — `id, event_id, user_id, queue_position, status (active|canceled), canceled_at, created_at` · unique `(event_id, user_id)`

**guests** — `id, rsvp_id, name (nullable), added_by_role (user|admin), approval_status (pending|approved|rejected|removed), approved_by, approved_at, waiver_token (unique), waiver_signed_at`

- One row per guest, so "user adds 2 more after 2 were approved" is just two new pending rows; earlier approvals untouched.

**waiver_signatures** — `id, waiver_version, signer_type (user|guest), user_id, guest_id, signed_at, ip`

**event_log** — `id, actor_user_id, event_id, action, payload (jsonb), created_at` · append-only; invaluable when someone disputes their queue spot.

## API surface

Auth: `POST /auth/otp/send` · `POST /auth/otp/verify` · `POST /auth/logout`

Member: `GET /events` · `GET /events/:id` · `POST /events/:id/rsvp` · `DELETE /events/:id/rsvp` · `POST /events/:id/rsvp/guests` · `DELETE /guests/:id`

Admin: `POST /events` · `POST /event-series` · `PATCH /events/:id` · `PATCH /event-series/:id` · `DELETE /events/:id` · `POST /guests/:id/approve` · `POST /guests/:id/reject` · `POST /events/:id/guests` (admin-added) · `PATCH /users/:id`

Public: `GET /waiver/:token` · `POST /waiver/:token/sign`

## Cross-cutting concerns

**Timezones.** Store UTC, render in the event's stored timezone. Recurrence math must be timezone-aware — a 3-month window crosses DST and naive date arithmetic will shift events by an hour.

**Location gating.** Evaluated server-side at serialization time, per policy: `always` → full; `hours_before:N` / `day_of` → `general_location` + a "reveals at" timestamp until the moment passes; `hidden` → nothing until day-of. The exact location must not appear in the API response before its reveal time.

**Privacy.** Members see display names only. Phone numbers are admin-visible only.

**Notifications.** SMS only for the moments that matter (waitlist promotion, event canceled). Everything else in-app, to control Twilio cost. Promotion SMS must be idempotent and best-effort — a failed send never rolls back the queue mutation.
