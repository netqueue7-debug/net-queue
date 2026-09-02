import { prisma } from "@/lib/db";
import { zonedTimeToUtc, zonedWeekday } from "@/lib/timezone";
import { generateOccurrenceDates, materializeOccurrence } from "./recurrence";
import { cancelEvent, updateEvent, type EventFields } from "./events";
import type { EventSeries } from "@/lib/generated/prisma/client";

export interface CreateSeriesInput {
  groupId: string;
  title: string;
  description: string | null;
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  // "YYYY-MM-DD", local to `timezone` — optional so existing direct
  // (non-HTTP) callers keep working unchanged; defaults to "today" (the
  // previous, only behavior) when omitted. The real form/API path always
  // sends one (required in createSeriesSchema).
  recurStartsAt?: string;
  recurUntil: string; // "YYYY-MM-DD", local to `timezone`
  signupOpensRule: "immediately" | "days_before";
  signupOpensDaysBefore: number | null;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  waiverRequired: boolean;
  generalLocation: string | null;
  exactLocation: string | null;
  googleMapsUrl: string | null;
  appleMapsUrl: string | null;
  locationRevealPolicy: "always" | "hours_before" | "day_of" | "hidden";
  locationRevealHours: number | null;
}

// Creates the series row and materializes every occurrence from
// `recurStartsAt` (default: today) through `recurUntil` up front
// (docs/phase-2-recurrence-guests.md — no rolling/lazy generation).
// `recurUntil`/`recurStartsAt` are anchored to local noon before use so
// later comparisons via `zonedDateString` are never thrown off by a
// UTC-midnight boundary landing on the previous local calendar day (see
// tests/recurrence.test.ts for why that matters).
export async function createSeries(
  createdBy: string,
  input: CreateSeriesInput,
): Promise<{ series: EventSeries; eventsCreated: number }> {
  const materializedAt = new Date();
  const recurUntilInstant = zonedTimeToUtc(input.recurUntil, "12:00", input.timezone);
  const recurStartsAtInstant = input.recurStartsAt ? zonedTimeToUtc(input.recurStartsAt, "12:00", input.timezone) : materializedAt;

  return prisma.$transaction(async (tx) => {
    const series = await tx.eventSeries.create({
      data: {
        groupId: input.groupId,
        title: input.title,
        description: input.description,
        weekdays: input.weekdays,
        startTime: input.startTime,
        endTime: input.endTime,
        timezone: input.timezone,
        recurUntil: recurUntilInstant,
        signupOpensRule: input.signupOpensRule,
        signupOpensDaysBefore: input.signupOpensDaysBefore,
        capacity: input.capacity,
        maxGuestsPerRsvp: input.maxGuestsPerRsvp,
        waiverRequired: input.waiverRequired,
        generalLocation: input.generalLocation,
        exactLocation: input.exactLocation,
        googleMapsUrl: input.googleMapsUrl,
        appleMapsUrl: input.appleMapsUrl,
        locationRevealPolicy: input.locationRevealPolicy,
        locationRevealHours: input.locationRevealHours,
        createdBy,
      },
    });

    const occurrences = generateOccurrenceDates(series.weekdays, series.timezone, recurStartsAtInstant, series.recurUntil);
    const eventsData = occurrences.map((occurrence) => {
      const { startsAt, endsAt, signupOpensAt } = materializeOccurrence(series, occurrence, materializedAt);
      return {
        groupId: series.groupId,
        seriesId: series.id,
        title: series.title,
        description: series.description,
        startsAt,
        endsAt,
        timezone: series.timezone,
        capacity: series.capacity,
        maxGuestsPerRsvp: series.maxGuestsPerRsvp,
        waiverRequired: series.waiverRequired,
        signupOpensAt,
        generalLocation: series.generalLocation,
        exactLocation: series.exactLocation,
        googleMapsUrl: series.googleMapsUrl,
        appleMapsUrl: series.appleMapsUrl,
        locationRevealPolicy: series.locationRevealPolicy,
        locationRevealHours: series.locationRevealHours,
        createdBy,
      };
    });

    if (eventsData.length > 0) {
      await tx.event.createMany({ data: eventsData });
    }

    return { series, eventsCreated: eventsData.length };
  });
}

export function listSeriesForGroup(groupId: string): Promise<EventSeries[]> {
  return prisma.eventSeries.findMany({ where: { groupId }, orderBy: { createdAt: "desc" } });
}

export function getSeries(id: string): Promise<EventSeries | null> {
  return prisma.eventSeries.findUnique({ where: { id } });
}

// Only the per-instance settings that map 1:1 onto an Event's own fields —
// see series-schema.ts for why the schedule shape (weekdays/times/
// timezone/recurUntil) isn't editable here.
export type UpdateSeriesInput = Partial<
  Pick<
    EventFields,
    | "title"
    | "description"
    | "capacity"
    | "maxGuestsPerRsvp"
    | "waiverRequired"
    | "generalLocation"
    | "exactLocation"
    | "googleMapsUrl"
    | "appleMapsUrl"
    | "locationRevealPolicy"
    | "locationRevealHours"
  >
>;

// Updates the series template, then propagates onto every future (starts
// in the future), non-overridden, still-scheduled instance — past and
// hand-edited (`overridden`) instances are never touched
// (docs/phase-2-recurrence-guests.md's series-edit-semantics task).
// Routed through the existing per-event `updateEvent` (not a bulk SQL
// update) specifically so a capacity change still goes through
// `withEventLock`'s boundary recompute and promotion notifications on
// every affected instance — architecture.md#the-critical-section applies
// per-event regardless of whether the edit originated from a series.
export async function updateSeries(
  seriesId: string,
  input: UpdateSeriesInput,
  actorUserId: string,
): Promise<{ series: EventSeries; updatedCount: number }> {
  const series = await prisma.eventSeries.update({ where: { id: seriesId }, data: input });

  const futureInstances = await prisma.event.findMany({
    where: { seriesId, overridden: false, status: "scheduled", startsAt: { gt: new Date() } },
    select: { id: true },
  });

  for (const { id } of futureInstances) {
    await updateEvent(id, input, actorUserId);
  }

  return { series, updatedCount: futureInstances.length };
}

// Cancels every future instance regardless of `overridden` — unlike an
// edit (which respects a hand-edited instance's independence), calling off
// the whole series calls off everything still ahead of it, including
// instances someone customized (docs/phase-2-recurrence-guests.md).
// Past instances are left alone. Reuses `cancelEvent` per instance so each
// one gets its own event_log row and going/waitlist notifications.
export async function cancelSeries(seriesId: string, actorUserId: string): Promise<{ canceledCount: number }> {
  const futureInstances = await prisma.event.findMany({
    where: { seriesId, status: "scheduled", startsAt: { gt: new Date() } },
    select: { id: true },
  });

  for (const { id } of futureInstances) {
    await cancelEvent(id, actorUserId);
  }

  return { canceledCount: futureInstances.length };
}

// Cancels every future instance that falls on `weekday` (0=Sun..6=Sat, an
// instance's own weekday recovered via `zonedWeekday` against its own
// `timezone` — same numbering `createSeries` took `weekdays` in) —
// overridden or not, same "calling off overrides individual customization"
// philosophy as `cancelSeries` (this is a series-level decision that a
// given weekday is done, not a per-instance edit). For a series that runs
// multiple weekdays (e.g. Tue/Thu), this drops just one of them; the rest
// of the series is untouched. Past instances are never touched. Also drops
// `weekday` from the series' own `weekdays` so it reads correctly going
// forward and a future horizon top-up (not yet built) won't regenerate it.
export async function cancelSeriesWeekday(
  seriesId: string,
  weekday: number,
  actorUserId: string,
): Promise<{ canceledCount: number }> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });

  const futureInstances = await prisma.event.findMany({
    where: { seriesId, status: "scheduled", startsAt: { gt: new Date() } },
    select: { id: true, startsAt: true, timezone: true },
  });

  const onWeekday = futureInstances.filter((instance) => zonedWeekday(instance.startsAt, instance.timezone) === weekday);

  for (const { id } of onWeekday) {
    await cancelEvent(id, actorUserId);
  }

  await prisma.eventSeries.update({
    where: { id: seriesId },
    data: { weekdays: series.weekdays.filter((d) => d !== weekday) },
  });

  return { canceledCount: onWeekday.length };
}
