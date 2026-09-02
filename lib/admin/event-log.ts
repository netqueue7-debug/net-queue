import { prisma } from "@/lib/db";

export interface TimelineEntry {
  id: string;
  createdAt: Date;
  action: string;
  description: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payloadOf(row: { payload: any }): any {
  return row.payload ?? {};
}

// Renders one event_log row as a human sentence — the whole point of the
// viewer (docs/phase-3-polish.md: "a full night's activity reads as a
// coherent timeline," not a raw payload dump). `nameOf` resolves a userId
// to a display name; `rsvpOwnerNameOf` resolves an rsvp id to *its*
// owner's display name, since several actions (cancel, guest approve/
// reject/remove) are keyed by rsvpId/guestId, not directly by the
// affected member — and the actor doing them (an admin) is often a
// different person from whoever the action was done *to*.
function describe(
  entry: { action: string; payload: unknown; actorUserId: string | null },
  nameOf: (userId: string | null) => string,
  rsvpOwnerOf: (rsvpId: string | undefined) => { id: string; name: string } | null,
): string {
  const payload = payloadOf({ payload: entry.payload });
  const actor = nameOf(entry.actorUserId);

  switch (entry.action) {
    case "rsvp.created":
      return `${actor} signed up (position #${payload.queuePosition ?? "?"}).`;
    case "rsvp.canceled": {
      const owner = rsvpOwnerOf(payload.rsvpId);
      return owner && owner.id !== entry.actorUserId ? `${actor} removed ${owner.name}'s RSVP.` : `${actor} canceled their RSVP.`;
    }
    case "event.capacity_changed":
      return `${actor} changed capacity from ${payload.from ?? "unlimited"} to ${payload.to ?? "unlimited"}.`;
    case "event.canceled":
      return `${actor} canceled the event.`;
    case "event.rescheduled": {
      const bits: string[] = [];
      if (payload.timeChanged) bits.push("time");
      if (payload.locationChanged) bits.push("location");
      return `${actor} changed the ${bits.join(" and ")}.`;
    }
    case "guest.added": {
      const count = Array.isArray(payload.guestIds) ? payload.guestIds.length : 1;
      return `${actor} added ${count} guest${count === 1 ? "" : "s"} (pending approval).`;
    }
    case "guest.admin_added": {
      const count = Array.isArray(payload.guestIds) ? payload.guestIds.length : 1;
      return `${actor} added ${count} guest${count === 1 ? "" : "s"} directly (admin, pre-approved).`;
    }
    case "guest.approved":
      return `${actor} approved a guest.`;
    case "guest.rejected":
      return `${actor} rejected a guest.`;
    case "guest.removed":
      return `${actor} removed a guest.`;
    default:
      return `${actor} — ${entry.action}.`;
  }
}

// The searchable per-event timeline (docs/phase-3-polish.md's "settles 'I
// was definitely before her'" task). Reads straight off `event_log`,
// append-only since Phase 1 — this is a pure read-side addition, nothing
// new is written here.
export async function getEventLogTimeline(eventId: string): Promise<TimelineEntry[]> {
  const rows = await prisma.eventLog.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });

  const userIds = new Set<string>();
  const rsvpIds = new Set<string>();
  for (const row of rows) {
    if (row.actorUserId) userIds.add(row.actorUserId);
    const payload = payloadOf(row);
    if (typeof payload.rsvpId === "string") rsvpIds.add(payload.rsvpId);
  }

  const [users, rsvps] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, displayName: true, phone: true } }),
    prisma.rsvp.findMany({ where: { id: { in: [...rsvpIds] } }, select: { id: true, userId: true } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const rsvpOwnerIdById = new Map(rsvps.map((r) => [r.id, r.userId]));

  function nameOf(userId: string | null): string {
    if (!userId) return "Someone";
    const u = userById.get(userId);
    return u?.displayName ?? u?.phone ?? "A former member";
  }

  function rsvpOwnerOf(rsvpId: string | undefined): { id: string; name: string } | null {
    if (!rsvpId) return null;
    const ownerId = rsvpOwnerIdById.get(rsvpId);
    return ownerId ? { id: ownerId, name: nameOf(ownerId) } : null;
  }

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    description: describe(row, nameOf, rsvpOwnerOf),
  }));
}
