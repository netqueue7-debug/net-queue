import { withEventLock } from "./with-event-lock";
import {
  AlreadyRsvpedError,
  EventCanceledError,
  EventNotFoundError,
  GroupWaiverNotAcceptedError,
  RsvpNotFoundError,
  SignupNotOpenError,
  UserBannedError,
} from "./errors";
import type { Rsvp } from "@/lib/generated/prisma/client";

// All validation happens inside withEventLock's transaction, per
// architecture.md#the-critical-section's pseudocode ("validate ... mutate"
// under the same lock) — not before it, so nothing can change between the
// check and the write.
export function createRsvp(eventId: string, userId: string): Promise<Rsvp> {
  return withEventLock(eventId, async (tx, event) => {
    // Group membership gates everything else — a non-member must see this
    // exactly like a nonexistent event (architecture.md#groups--tenancy).
    const membership = await tx.groupMembership.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId } },
    });
    if (!membership || membership.status !== "active") throw new EventNotFoundError();

    if (event.status === "canceled") throw new EventCanceledError();

    // Server time only — never trust a client-supplied timestamp
    // (conventions.md#validation-authorization).
    if (new Date() < event.signupOpensAt) throw new SignupNotOpenError();

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.bannedAt) throw new UserBannedError();

    // The group's own waiver — only gates when this event/series opted in
    // (policy.md#6). This is the only waiver tier now (the platform waiver
    // was removed 2026-09-03).
    if (event.waiverRequired) {
      const group = await tx.group.findUniqueOrThrow({ where: { id: event.groupId } });
      if (group.waiverVersion === null || membership.groupWaiverVersionAccepted !== group.waiverVersion) {
        throw new GroupWaiverNotAcceptedError();
      }
    }

    const existing = await tx.rsvp.findFirst({ where: { eventId, userId, status: "active" } });
    if (existing) throw new AlreadyRsvpedError();

    // Safe under the lock: MAX+1 can't race with another signup because
    // withEventLock holds FOR UPDATE on the event row for the whole transaction.
    const agg = await tx.rsvp.aggregate({ where: { eventId }, _max: { queuePosition: true } });
    const queuePosition = (agg._max.queuePosition ?? 0) + 1;

    const rsvp = await tx.rsvp.create({ data: { eventId, userId, queuePosition, status: "active" } });

    await tx.eventLog.create({
      data: {
        actorUserId: userId,
        eventId,
        action: "rsvp.created",
        payload: { rsvpId: rsvp.id, queuePosition },
      },
    });

    return rsvp;
  });
}

// `actorUserId` defaults to `userId` (a self-cancel) but can be a different
// user — an admin removing someone else's RSVP goes through this same path
// (same promotion behavior), just with a different actor on the log row.
// No group-membership gate here (unlike createRsvp): canceling an existing
// RSVP must keep working even if the member's group standing changed since
// they signed up (e.g. an admin-removal flow, or a lapsed membership) — the
// RsvpNotFoundError below already hides a nonexistent/foreign RSVP from
// anyone who was never a member, since they'd have no row to find.
export function cancelRsvp(eventId: string, userId: string, actorUserId: string = userId): Promise<Rsvp> {
  return withEventLock(eventId, async (tx) => {
    const rsvp = await tx.rsvp.findFirst({ where: { eventId, userId, status: "active" } });
    if (!rsvp) throw new RsvpNotFoundError();

    const canceled = await tx.rsvp.update({
      where: { id: rsvp.id },
      data: { status: "canceled", canceledAt: new Date() },
    });

    await tx.eventLog.create({
      data: {
        actorUserId,
        eventId,
        action: "rsvp.canceled",
        payload: { rsvpId: rsvp.id },
      },
    });

    return canceled;
  });
}
