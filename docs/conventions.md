# Conventions

## Layout

```
app/                    Next.js routes (pages + route handlers)
  (member)/             member-facing pages
  admin/                admin pages
  api/                  route handlers — thin: parse, authorize, call service, serialize
components/
  ui/                   shared design-system primitives (Button, Field/Input, Card, Badge, ConfirmDialog, ...) — no business logic
lib/
  db.ts                 Prisma client singleton
  auth/                 session, OTP, rate limiting
  events/               event + series services
  rsvp/                 queue engine  ← the heart of the system
  notifications/
  serializers/          shape DB rows into API responses (location gating lives here)
prisma/schema.prisma
tests/
```

**Route handlers stay thin.** Business logic lives in `lib/*` services so it is testable without HTTP. A route handler parses input, checks authz, calls one service function, serializes the result.

## Transactions

Anything touching the queue goes through the shared helper:

```ts
withEventLock(eventId, async (tx, event) => { ... })
```

It opens a transaction, takes the per-event lock, snapshots derived statuses, runs the callback, recomputes statuses, diffs them, and enqueues notifications. **Do not write ad-hoc transactions for RSVP mutations** — if you find yourself needing one, the helper needs extending.

Notifications are enqueued inside the transaction but dispatched after commit. A Twilio failure must never roll back a queue mutation.

## Validation & authorization

- Validate every request body with Zod at the route boundary. Never trust client-supplied timestamps, capacities, or user ids.
- Authorization is checked in the service layer, not just the UI. Assume every admin endpoint will be called directly by a curious member.
- Time gates (`signup_opens_at`, location reveal) are evaluated against server time only.

## Errors

Services throw typed domain errors (`SignupNotOpenError`, `GuestCapExceededError`, `AlreadyRsvpedError`); the route handler maps them to status codes. Error messages shown to users should say what to do next, not just what failed.

## Testing

- **Unit:** seat math and the derived-status computation, exhaustively. This is the highest-value test surface in the codebase — table-driven tests over capacities, party sizes, and cancellations.
- **Integration:** each service function against a real test Postgres. Prefer these over mocks for anything transactional.
- **Concurrency:** every phase that touches the queue needs a test firing N simultaneous requests and asserting the invariants hold (no duplicate positions, no over-capacity going list, order strictly by arrival).
- **E2E (Playwright):** the member happy path and the admin happy path per phase.

Write the test with the feature, not after the phase.

## Style

- TypeScript strict mode. No `any`.
- Dates: store and pass `Date`/UTC; format only at the view layer, in the event's timezone.
- Money/counts: plain integers. Nullable means "unlimited" for `capacity` and `max_guests_per_rsvp` — never use `0` or `-1` as a sentinel.
- Prefer explicit names over clever ones: `promoteFromWaitlist` is wrong (nothing moves) — `recomputeSeatBoundary` is right.
- No new dependencies without asking.

## Migrations

One migration per logical change, named descriptively. Never edit a migration that has been applied to a shared environment. Schema changes not described in the current phase doc need a conversation first.
