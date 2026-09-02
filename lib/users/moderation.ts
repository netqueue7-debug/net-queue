import { prisma } from "@/lib/db";
import { cancelRsvp } from "@/lib/rsvp/rsvp";
import { RsvpNotFoundError } from "@/lib/rsvp/errors";

export interface BanPreviewItem {
  rsvpId: string;
  eventId: string;
  eventTitle: string;
  startsAt: Date;
}

// `banned_at` is global, not per-group (docs/phase-0b-groups.md's "per-group
// ban lists" is an explicit out-of-scope gap) — banning cancels *every*
// upcoming active RSVP the user holds, in any group, since createRsvp's own
// ban check (lib/rsvp/rsvp.ts) is equally global. This is what an admin
// needs to see before confirming (docs/phase-3-polish.md's own check).
export async function getBanPreview(userId: string): Promise<BanPreviewItem[]> {
  const rsvps = await prisma.rsvp.findMany({
    where: { userId, status: "active", event: { status: "scheduled", startsAt: { gt: new Date() } } },
    include: { event: { select: { id: true, title: true, startsAt: true } } },
    orderBy: { event: { startsAt: "asc" } },
  });
  return rsvps.map((r) => ({ rsvpId: r.id, eventId: r.event.id, eventTitle: r.event.title, startsAt: r.event.startsAt }));
}

// Cancellations are explicit (each goes through cancelRsvp — same
// notification/event_log path as any other cancellation), never silent.
export async function banUser(userId: string, actorId: string): Promise<{ canceledCount: number }> {
  const activeRsvps = await prisma.rsvp.findMany({
    where: { userId, status: "active", event: { status: "scheduled", startsAt: { gt: new Date() } } },
    select: { eventId: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { bannedAt: new Date() } });

  let canceledCount = 0;
  for (const rsvp of activeRsvps) {
    try {
      await cancelRsvp(rsvp.eventId, userId, actorId);
      canceledCount++;
    } catch (e) {
      // Another cancellation (or the ban preview being stale by the time
      // this runs) already removed it — not an error worth failing the
      // whole ban over.
      if (!(e instanceof RsvpNotFoundError)) throw e;
    }
  }

  return { canceledCount };
}

// Deliberately does *not* restore or re-queue anything — the user simply
// becomes eligible to sign up again, at the back of the queue like anyone
// else (docs/phase-3-polish.md).
export async function unbanUser(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { bannedAt: null } });
}
