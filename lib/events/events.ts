import { prisma } from "@/lib/db";
import { withEventLock } from "@/lib/rsvp/with-event-lock";
import type { Event } from "@/lib/generated/prisma/client";

export interface EventFields {
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  capacity: number | null;
  maxGuestsPerRsvp: number | null;
  signupOpensAt: Date;
  generalLocation: string | null;
  exactLocation: string | null;
  locationRevealPolicy: "always" | "hours_before" | "day_of" | "hidden";
  locationRevealHours: number | null;
}

export function createEvent(createdBy: string, input: EventFields): Promise<Event> {
  return prisma.event.create({ data: { ...input, createdBy } });
}

export function listEvents(): Promise<Event[]> {
  return prisma.event.findMany({ orderBy: { startsAt: "asc" } });
}

export function getEvent(id: string): Promise<Event | null> {
  return prisma.event.findUnique({ where: { id } });
}

// Capacity is the one field that affects the RSVP queue boundary, so a
// capacity change must go through withEventLock (which recomputes who's
// going/waitlisted and diffs for promotion/demotion notifications) — every
// other field is a plain update. If both change in the same call, the
// non-capacity fields are applied inside the same lock/transaction too,
// since withEventLock's callback has a transaction client anyway.
export async function updateEvent(id: string, input: Partial<EventFields>): Promise<Event> {
  if ("capacity" in input) {
    return withEventLock(id, (tx) => tx.event.update({ where: { id }, data: input }));
  }
  return prisma.event.update({ where: { id }, data: input });
}

export function cancelEvent(id: string): Promise<Event> {
  return prisma.event.update({ where: { id }, data: { status: "canceled" } });
}
