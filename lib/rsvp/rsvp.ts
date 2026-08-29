import { withEventLock } from "./with-event-lock";
import {
  AlreadyRsvpedError,
  EventCanceledError,
  RsvpNotFoundError,
  SignupNotOpenError,
  UserBannedError,
  WaiverNotAcceptedError,
} from "./errors";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import type { Rsvp } from "@/lib/generated/prisma/client";

// All validation happens inside withEventLock's transaction, per
// architecture.md#the-critical-section's pseudocode ("validate ... mutate"
// under the same lock) — not before it, so nothing can change between the
// check and the write.
export function createRsvp(eventId: string, userId: string): Promise<Rsvp> {
  return withEventLock(eventId, async (tx, event) => {
    if (event.status === "canceled") throw new EventCanceledError();

    // Server time only — never trust a client-supplied timestamp
    // (conventions.md#validation-authorization).
    if (new Date() < event.signupOpensAt) throw new SignupNotOpenError();

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.bannedAt) throw new UserBannedError();
    if (user.waiverVersion !== WAIVER_VERSION) throw new WaiverNotAcceptedError();

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
