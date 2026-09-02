import { prisma } from "@/lib/db";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { getApprovedGuestCounts, seatsFor } from "@/lib/rsvp/seats";

export interface EventDashboardRow {
  id: string;
  title: string;
  startsAt: Date;
  capacity: number | null;
  goingSeats: number;
  // null for an uncapped event — there's no meaningful "fill rate" against
  // an unlimited capacity.
  fillRate: number | null;
  pendingGuestCount: number;
  // Approved guests with no waiver signature yet — the "outstanding
  // waiver" badge from policy.md's derived rules ("waivers never block...
  // show an outstanding waiver badge to admins so they can collect
  // onsite"), surfaced here for the first time.
  outstandingWaiverCount: number;
}

// "Upcoming events at a glance" (docs/phase-3-polish.md's admin dashboard
// task) — fill rate, pending guest approvals, and outstanding waivers per
// event, for every not-yet-started scheduled event in the group.
export async function getGroupEventsDashboard(groupId: string): Promise<EventDashboardRow[]> {
  const events = await prisma.event.findMany({
    where: { groupId, status: "scheduled", startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return Promise.all(
    events.map(async (event) => {
      const active = await prisma.rsvp.findMany({
        where: { eventId: event.id, status: "active" },
        select: { id: true, queuePosition: true },
      });
      const guestCounts = await getApprovedGuestCounts(
        prisma,
        active.map((r) => r.id),
      );
      const statuses = computeDerivedStatuses(
        active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: seatsFor(r.id, guestCounts) })),
        event.capacity,
      );
      const goingSeats = active
        .filter((r) => statuses.get(r.id) === "going")
        .reduce((sum, r) => sum + seatsFor(r.id, guestCounts), 0);

      const [pendingGuestCount, outstandingWaiverCount] = await Promise.all([
        prisma.guest.count({ where: { approvalStatus: "pending", rsvp: { eventId: event.id } } }),
        prisma.guest.count({ where: { approvalStatus: "approved", waiverSignedAt: null, rsvp: { eventId: event.id } } }),
      ]);

      return {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        capacity: event.capacity,
        goingSeats,
        fillRate: event.capacity ? goingSeats / event.capacity : null,
        pendingGuestCount,
        outstandingWaiverCount,
      };
    }),
  );
}

export interface GroupDashboardSummary {
  pendingMembershipCount: number;
  pendingGuestCount: number;
}

export async function getGroupDashboardSummary(groupId: string): Promise<GroupDashboardSummary> {
  const [pendingMembershipCount, pendingGuestCount] = await Promise.all([
    prisma.groupMembership.count({ where: { groupId, status: "pending" } }),
    prisma.guest.count({ where: { approvalStatus: "pending", rsvp: { event: { groupId, status: "scheduled" } } } }),
  ]);
  return { pendingMembershipCount, pendingGuestCount };
}
