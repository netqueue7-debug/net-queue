import { prisma } from "@/lib/db";
import { withEventLock } from "@/lib/rsvp/with-event-lock";
import { enqueueNotification, dispatchNotifications } from "@/lib/notifications/notifications";
import type { Event, Prisma } from "@/lib/generated/prisma/client";

export interface EventFields {
  groupId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  waiverRequired: boolean;
  signupOpensAt: Date;
  generalLocation: string | null;
  exactLocation: string | null;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
  locationRevealPolicy: "always" | "hours_before" | "day_of" | "hidden";
  locationRevealHours: number | null;
}

export function createEvent(createdBy: string, input: EventFields): Promise<Event> {
  return prisma.event.create({ data: { ...input, createdBy } });
}

// Admin management listing: every event regardless of status, scoped to
// one group — there's no such thing as an unscoped admin listing anymore
// (docs/phase-0b-groups.md).
export function listEvents(groupId: string): Promise<Event[]> {
  return prisma.event.findMany({ where: { groupId }, orderBy: { startsAt: "asc" } });
}

// Member-facing listing: not-canceled events across every group the viewer
// has an active membership in, excluding ones that have already ended
// (`endsAt`, not `startsAt` — an event currently in progress still counts
// as "upcoming"/current, not passed). An empty `groupIds` (member of
// nothing) correctly yields no events, not "all events" — never pass an
// unfiltered query here.
export function listUpcomingEvents(groupIds: string[]): Promise<Event[]> {
  return prisma.event.findMany({
    where: { status: "scheduled", groupId: { in: groupIds }, endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
  });
}

// Calendar-view listing: not-canceled events across the given groups
// within [start, end) — same "empty groupIds -> no events" rule as
// listUpcomingEvents. Used both for the member's all-groups calendar and
// (with a single-element groupIds) a group-scoped calendar.
export function listEventsInRange(groupIds: string[], start: Date, end: Date): Promise<Event[]> {
  return prisma.event.findMany({
    where: { status: "scheduled", groupId: { in: groupIds }, startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: "asc" },
  });
}

export function getEvent(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } });
}

// Every instance of one series, regardless of status — the admin series
// detail page's instance list (docs/phase-2-recurrence-guests.md).
export function listEventsForSeries(seriesId: string): Promise<Event[]> {
  return prisma.event.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" } });
}

// Detects a change to the event's own schedule or location (distinct from
// capacity, which has its own boundary-recompute path below) and, if
// anything actually moved, logs it and SMS-notifies every still-active
// RSVP holder — going *and* waitlist, same scope as cancelEvent, since a
// waitlisted person still cares where/when the event they're queued for
// is. The SMS body (lib/notifications/notifications.ts#renderSmsBody)
// deliberately never repeats the new address — exactLocation is still
// subject to its own reveal-timing gate (architecture.md#location-gating)
// and this must not become a side channel around it.
async function notifyIfRescheduledOrRelocated(
  tx: Prisma.TransactionClient,
  eventId: string,
  before: Event,
  after: Event,
  actorUserId?: string,
): Promise<string[]> {
  const timeChanged = after.startsAt.getTime() !== before.startsAt.getTime() || after.endsAt.getTime() !== before.endsAt.getTime();
  const locationChanged = after.generalLocation !== before.generalLocation || after.exactLocation !== before.exactLocation;
  if (!timeChanged && !locationChanged) return [];

  await tx.eventLog.create({
    data: {
      actorUserId,
      eventId,
      action: "event.rescheduled",
      payload: {
        timeChanged,
        locationChanged,
        from: { startsAt: before.startsAt, endsAt: before.endsAt, generalLocation: before.generalLocation },
        to: { startsAt: after.startsAt, endsAt: after.endsAt, generalLocation: after.generalLocation },
      },
    },
  });

  const activeRsvps = await tx.rsvp.findMany({ where: { eventId, status: "active" }, select: { userId: true } });
  const notificationIds: string[] = [];
  for (const rsvp of activeRsvps) {
    const notification = await enqueueNotification(tx, {
      userId: rsvp.userId,
      eventId,
      type: "event_updated",
      payload: { eventTitle: after.title, startsAt: after.startsAt.toISOString(), timezone: after.timezone, timeChanged, locationChanged },
    });
    notificationIds.push(notification.id);
  }
  return notificationIds;
}

// Capacity is the one field that affects the RSVP queue boundary, so a
// capacity change must go through withEventLock (which recomputes who's
// going/waitlisted and diffs for promotion/demotion notifications) — every
// other field is a plain update, still wrapped in its own transaction so a
// reschedule/relocation diff has a consistent before/after pair to compare.
// If several fields change in the same call, both diffs run either way.
//
// `markOverridden` flips `overridden` to true alongside whatever else is
// being changed — set only by the single-instance edit route (an admin
// hand-editing one occurrence), never by `updateSeries`'s own propagation
// loop, which is exactly the "this event vs. all following" distinction
// `overridden` exists to encode (see the field's comment in schema.prisma
// and lib/events/series.ts#updateSeries). Left `false` by default so every
// other existing caller (tests, series propagation) is unaffected.
export async function updateEvent(
  id: string,
  input: Partial<EventFields>,
  actorUserId?: string,
  options?: { markOverridden?: boolean },
): Promise<Event> {
  const notificationIds: string[] = [];
  const data = options?.markOverridden ? { ...input, overridden: true } : input;

  const updated = await (
    "capacity" in input
      ? withEventLock(id, async (tx, before) => {
          const updatedRow = await tx.event.update({ where: { id }, data });

          // The edit form always resubmits every field, so "capacity" in
          // input is true on every save, not just ones that actually
          // change it — log and notify only when the value itself moved
          // (before.capacity !== updatedRow.capacity), never a
          // same-to-same "changed from 14 to 14."
          if (updatedRow.capacity !== before.capacity) {
            await tx.eventLog.create({
              data: {
                actorUserId,
                eventId: id,
                action: "event.capacity_changed",
                payload: { from: before.capacity, to: updatedRow.capacity },
              },
            });

            // In-app only (docs/phase-3-polish.md) — separate from, and on
            // top of, whatever rsvp_promoted/rsvp_demoted SMS this same
            // capacity change triggers via withEventLock's own boundary diff.
            const activeRsvps = await tx.rsvp.findMany({ where: { eventId: id, status: "active" }, select: { userId: true } });
            for (const rsvp of activeRsvps) {
              await enqueueNotification(tx, {
                userId: rsvp.userId,
                eventId: id,
                type: "capacity_changed",
                payload: { eventTitle: updatedRow.title, from: before.capacity, to: updatedRow.capacity },
              });
            }
          }

          notificationIds.push(...(await notifyIfRescheduledOrRelocated(tx, id, before, updatedRow, actorUserId)));

          return updatedRow;
        })
      : prisma.$transaction(async (tx) => {
          const before = await tx.event.findUniqueOrThrow({ where: { id } });
          const updatedRow = await tx.event.update({ where: { id }, data });
          notificationIds.push(...(await notifyIfRescheduledOrRelocated(tx, id, before, updatedRow, actorUserId)));
          return updatedRow;
        })
  );

  await dispatchNotifications(notificationIds);

  return updated;
}

// Cancellation doesn't touch the RSVP queue boundary (capacity and RSVPs
// are untouched — only the event's own status flips), so this doesn't need
// withEventLock's per-event row lock the way a capacity change does. It
// does need to notify everyone still active (going *and* waitlist) —
// phase-2-recurrence-guests.md's cancellation task — since from their
// point of view the event they were queued for no longer exists. SMS
// notifications are enqueued inside the same transaction as the
// cancellation (so they're part of one atomic mutation) and dispatched
// only after it commits — see lib/notifications/notifications.ts.
export async function cancelEvent(id: string, actorUserId?: string): Promise<Event> {
  const notificationIds: string[] = [];

  const event = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id }, data: { status: "canceled" } });
    await tx.eventLog.create({ data: { actorUserId, eventId: id, action: "event.canceled", payload: {} } });

    const activeRsvps = await tx.rsvp.findMany({ where: { eventId: id, status: "active" }, select: { userId: true } });
    for (const rsvp of activeRsvps) {
      const notification = await enqueueNotification(tx, {
        userId: rsvp.userId,
        eventId: id,
        type: "event_canceled",
        payload: { eventTitle: updated.title, startsAt: updated.startsAt.toISOString(), timezone: updated.timezone },
      });
      notificationIds.push(notification.id);
    }

    return updated;
  });

  await dispatchNotifications(notificationIds);

  return event;
}
