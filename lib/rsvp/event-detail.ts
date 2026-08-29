import { prisma } from "@/lib/db";
import { computeDerivedStatuses, type DerivedStatus } from "./seat-math";
import { serializeEvent, type SerializedEvent } from "@/lib/serializers/event";

export interface RsvpListItem {
  rsvpId: string;
  userId: string;
  displayName: string | null;
  queuePosition: number;
  // Phone numbers are admin-visible only (architecture.md#cross-cutting-concerns).
  phone?: string;
}

export interface EventDetail {
  event: SerializedEvent;
  going: RsvpListItem[];
  waitlist: RsvpListItem[];
  canceled: RsvpListItem[];
  yourRsvp: { status: DerivedStatus | "canceled" | null; queuePosition: number | null };
}

export async function getEventDetail(
  eventId: string,
  viewer: { id: string; role: "member" | "admin" },
): Promise<EventDetail | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const rsvps = await prisma.rsvp.findMany({
    where: { eventId },
    orderBy: { queuePosition: "asc" },
    include: { user: { select: { id: true, displayName: true, phone: true } } },
  });

  const active = rsvps.filter((r) => r.status === "active");
  const canceled = rsvps.filter((r) => r.status === "canceled");

  const statuses = computeDerivedStatuses(
    active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 })),
    event.capacity,
  );

  function toItem(r: (typeof rsvps)[number]): RsvpListItem {
    const base = { rsvpId: r.id, userId: r.userId, displayName: r.user.displayName, queuePosition: r.queuePosition };
    return viewer.role === "admin" ? { ...base, phone: r.user.phone } : base;
  }

  const going = active.filter((r) => statuses.get(r.id) === "going").map(toItem);
  const waitlist = active.filter((r) => statuses.get(r.id) === "waitlist").map(toItem);
  const canceledItems = canceled.map(toItem);

  const yours = active.find((r) => r.userId === viewer.id);
  const yourRsvp = yours
    ? { status: statuses.get(yours.id) ?? null, queuePosition: yours.queuePosition }
    : {
        status: canceled.some((r) => r.userId === viewer.id) ? ("canceled" as const) : null,
        queuePosition: null,
      };

  return {
    event: serializeEvent(event, viewer.role),
    going,
    waitlist,
    canceled: canceledItems,
    yourRsvp,
  };
}
