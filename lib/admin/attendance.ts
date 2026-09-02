import { prisma } from "@/lib/db";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { getApprovedGuestCounts, seatsFor } from "@/lib/rsvp/seats";

export interface AttendanceRow {
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  status: "going" | "waitlist" | "canceled";
}

// Every RSVP this user has ever made within one group, most recent first,
// with their derived status recomputed at read time — never stored
// (architecture.md's core invariant applies here too).
export async function getMemberAttendanceInGroup(groupId: string, userId: string): Promise<AttendanceRow[]> {
  const rsvps = await prisma.rsvp.findMany({
    where: { userId, event: { groupId } },
    include: { event: { select: { id: true, title: true, startsAt: true, capacity: true } } },
    orderBy: { event: { startsAt: "desc" } },
  });

  return Promise.all(
    rsvps.map(async (rsvp) => {
      if (rsvp.status === "canceled") {
        return { eventId: rsvp.event.id, eventTitle: rsvp.event.title, startsAt: rsvp.event.startsAt, status: "canceled" as const };
      }

      const active = await prisma.rsvp.findMany({
        where: { eventId: rsvp.eventId, status: "active" },
        select: { id: true, queuePosition: true },
      });
      const guestCounts = await getApprovedGuestCounts(
        prisma,
        active.map((r) => r.id),
      );
      const statuses = computeDerivedStatuses(
        active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: seatsFor(r.id, guestCounts) })),
        rsvp.event.capacity,
      );

      return {
        eventId: rsvp.event.id,
        eventTitle: rsvp.event.title,
        startsAt: rsvp.event.startsAt,
        status: statuses.get(rsvp.id) ?? "waitlist",
      };
    }),
  );
}
