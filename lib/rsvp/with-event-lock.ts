import { prisma } from "@/lib/db";
import { computeDerivedStatuses, type DerivedStatus } from "./seat-math";
import type { Event, Prisma } from "@/lib/generated/prisma/client";

export interface StatusChange {
  rsvpId: string;
  userId: string;
  from: DerivedStatus;
  to: DerivedStatus;
}

async function snapshotStatuses(tx: Prisma.TransactionClient, eventId: string, capacity: number | null) {
  const activeRsvps = await tx.rsvp.findMany({
    where: { eventId, status: "active" },
    select: { id: true, userId: true, queuePosition: true },
  });

  const statuses = computeDerivedStatuses(
    activeRsvps.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 })),
    capacity,
  );

  return { activeRsvps, statuses };
}

// Every RSVP-queue mutation (create, cancel, capacity change, guest
// approval once Phase 2 lands) must go through this — see
// architecture.md#the-critical-section. Do not write ad-hoc transactions
// for RSVP mutations (conventions.md#transactions).
//
// Notifications are computed inside the transaction (so the diff sees a
// consistent before/after pair) but dispatched only after commit, and a
// dispatch failure must never roll back the mutation — see below.
export async function withEventLock<T>(
  eventId: string,
  callback: (tx: Prisma.TransactionClient, event: Event) => Promise<T>,
): Promise<T> {
  const changes: StatusChange[] = [];

  const result = await prisma.$transaction(
    async (tx) => {
      // Row lock, held for the transaction. Fetched again below (typed, via
      // the normal query builder) rather than reading columns off this raw
      // query — Prisma's $queryRaw returns snake_case DB column names, not
      // the camelCase model shape.
      await tx.$executeRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
      const eventBefore = await tx.event.findUniqueOrThrow({ where: { id: eventId } });

      const before = await snapshotStatuses(tx, eventId, eventBefore.capacity);

      const callbackResult = await callback(tx, eventBefore);

      const eventAfter = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      const after = await snapshotStatuses(tx, eventId, eventAfter.capacity);

      const userIdByRsvpId = new Map<string, string>();
      for (const r of before.activeRsvps) userIdByRsvpId.set(r.id, r.userId);
      for (const r of after.activeRsvps) userIdByRsvpId.set(r.id, r.userId);

      // Only RSVPs present (active) both before and after count as "crossed
      // the boundary" — a brand-new signup or a just-canceled RSVP has no
      // real prior/subsequent status to compare against, so it's excluded.
      for (const [id, from] of before.statuses) {
        const to = after.statuses.get(id);
        if (to !== undefined && to !== from) {
          changes.push({ rsvpId: id, userId: userIdByRsvpId.get(id)!, from, to });
        }
      }

      return callbackResult;
    },
    // Under heavy contention (many RSVPs racing the same event lock), a
    // transaction near the back of the queue can wait well past Prisma's
    // 5s default `timeout` just for FOR UPDATE to release — that's not a
    // hang, it's the lock working as designed. See scripts/load-test-rsvp.ts.
    { maxWait: 10_000, timeout: 30_000 },
  );

  for (const change of changes) {
    dispatchStatusChangeNotification(change);
  }

  return result;
}

// Phase 1: no-op logger. Real SMS dispatch is Phase 3
// (architecture.md#cross-cutting-concerns — "Promotion SMS must be
// idempotent and best-effort — a failed send never rolls back the queue
// mutation," which this satisfies by construction: it only runs after commit).
function dispatchStatusChangeNotification(change: StatusChange): void {
  console.log(`[notify] rsvp ${change.rsvpId} (user ${change.userId}): ${change.from} -> ${change.to}`);
}
