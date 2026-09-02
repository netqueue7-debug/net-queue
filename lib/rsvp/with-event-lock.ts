import { prisma } from "@/lib/db";
import { computeDerivedStatuses, type DerivedStatus } from "./seat-math";
import { getApprovedGuestCounts, seatsFor } from "./seats";
import { enqueueNotification, dispatchNotifications } from "@/lib/notifications/notifications";
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

  // seats(rsvp) = 1 + approved guest count (policy.md#1/#2) — Phase 1 had
  // no guests, so this was always 1; Phase 2 computes it for real.
  const guestCounts = await getApprovedGuestCounts(
    tx,
    activeRsvps.map((r) => r.id),
  );

  const statuses = computeDerivedStatuses(
    activeRsvps.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: seatsFor(r.id, guestCounts) })),
    capacity,
  );

  return { activeRsvps, statuses };
}

// Every RSVP-queue mutation (create, cancel, capacity change, guest
// approval once Phase 2 lands) must go through this — see
// architecture.md#the-critical-section. Do not write ad-hoc transactions
// for RSVP mutations (conventions.md#transactions).
//
// Notifications are enqueued (as real `Notification` rows) inside the
// transaction — so the diff sees a consistent before/after pair and the
// row is part of the same atomic mutation — but dispatched (actually sent)
// only after commit, and a dispatch failure must never roll back the
// mutation — see lib/notifications/notifications.ts.
export async function withEventLock<T>(
  eventId: string,
  callback: (tx: Prisma.TransactionClient, event: Event) => Promise<T>,
): Promise<T> {
  const notificationIds: string[] = [];

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
          const userId = userIdByRsvpId.get(id)!;
          const notification = await enqueueNotification(tx, {
            userId,
            eventId,
            type: to === "going" ? "rsvp_promoted" : "rsvp_demoted",
            payload: {
              rsvpId: id,
              eventTitle: eventAfter.title,
              startsAt: eventAfter.startsAt.toISOString(),
              timezone: eventAfter.timezone,
            },
          });
          notificationIds.push(notification.id);
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

  await dispatchNotifications(notificationIds);

  return result;
}
