import { prisma } from "@/lib/db";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { getApprovedGuestCounts, seatsFor } from "@/lib/rsvp/seats";
import { locationRevealAt } from "@/lib/serializers/event";
import { zonedDateString } from "@/lib/timezone";
import { enqueueNotification } from "./notifications";
import type { Event } from "@/lib/generated/prisma/client";

// Cron-driven notifications are meant to fire **at most once per (user,
// event)**, ever — unlike the mutation-triggered types in notifications.ts,
// where repeat occurrences are legitimate. So each job checks for an
// existing row before enqueueing, instead of relying on enqueueNotification's
// no-dedupe-by-default behavior. This is what makes "running one twice
// sends nothing twice" (docs/phase-3-polish.md) true for these two jobs.
async function alreadyNotified(userId: string, eventId: string, type: "location_reveal" | "day_before_reminder"): Promise<boolean> {
  const existing = await prisma.notification.findFirst({ where: { userId, eventId, type } });
  return existing !== null;
}

async function goingUserIds(event: Pick<Event, "id" | "capacity">): Promise<string[]> {
  const active = await prisma.rsvp.findMany({
    where: { eventId: event.id, status: "active" },
    select: { id: true, userId: true, queuePosition: true },
  });
  const guestCounts = await getApprovedGuestCounts(
    prisma,
    active.map((r) => r.id),
  );
  const statuses = computeDerivedStatuses(
    active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: seatsFor(r.id, guestCounts) })),
    event.capacity,
  );
  return active.filter((r) => statuses.get(r.id) === "going").map((r) => r.userId);
}

async function activeUserIds(eventId: string): Promise<string[]> {
  const active = await prisma.rsvp.findMany({ where: { eventId, status: "active" }, select: { userId: true } });
  return active.map((r) => r.userId);
}

// Notifies the going list once each event's location actually reveals.
// `always`-policy events have no reveal moment (already always visible),
// so they're excluded entirely.
export async function runLocationRevealJob(now: Date = new Date()): Promise<number> {
  const events = await prisma.event.findMany({
    where: { status: "scheduled", locationRevealPolicy: { not: "always" }, startsAt: { gt: now } },
  });

  let sent = 0;
  for (const event of events) {
    if (locationRevealAt(event) > now) continue; // not revealed yet

    for (const userId of await goingUserIds(event)) {
      if (await alreadyNotified(userId, event.id, "location_reveal")) continue;
      await prisma.$transaction((tx) =>
        enqueueNotification(tx, { userId, eventId: event.id, type: "location_reveal", payload: { eventTitle: event.title } }),
      );
      sent++;
    }
  }
  return sent;
}

// Notifies going + waitlist the day before each event, in the event's own
// timezone (a 7am run shouldn't decide "tomorrow" using the server's zone).
export async function runDayBeforeReminderJob(now: Date = new Date()): Promise<number> {
  const events = await prisma.event.findMany({
    where: { status: "scheduled", startsAt: { gt: now } },
  });

  let sent = 0;
  for (const event of events) {
    // Compare calendar dates as Y-M-D strings, both read in the event's own
    // timezone — "is 'now' the day before the event's local date," not a
    // UTC or server-local approximation of it.
    const eventDateStr = zonedDateString(event.startsAt, event.timezone);
    const nowDateStr = zonedDateString(now, event.timezone);
    const dayBeforeEventDate = new Date(`${eventDateStr}T00:00:00Z`);
    dayBeforeEventDate.setUTCDate(dayBeforeEventDate.getUTCDate() - 1);
    const dayBeforeEventDateStr = dayBeforeEventDate.toISOString().slice(0, 10);
    if (nowDateStr !== dayBeforeEventDateStr) continue;

    for (const userId of await activeUserIds(event.id)) {
      if (await alreadyNotified(userId, event.id, "day_before_reminder")) continue;
      await prisma.$transaction((tx) =>
        enqueueNotification(tx, { userId, eventId: event.id, type: "day_before_reminder", payload: { eventTitle: event.title } }),
      );
      sent++;
    }
  }
  return sent;
}
