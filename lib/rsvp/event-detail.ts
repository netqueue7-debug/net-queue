import { prisma } from "@/lib/db";
import { computeDerivedStatuses, type DerivedStatus } from "./seat-math";
import { getApprovedGuestCounts, seatsFor } from "./seats";
import { listUpcomingEvents } from "@/lib/events/events";
import { getActiveGroupIds, getActiveMembership, resolveGroupMembership } from "@/lib/groups/authz";
import { serializeEvent, type SerializedEvent } from "@/lib/serializers/event";
import { listComments, type EventCommentItem } from "@/lib/comments/comments";

export interface GuestSummary {
  id: string;
  name: string | null;
  approvalStatus: "pending" | "approved";
  // The credential for /waiver/:token — only visible to the host (to send
  // to their guest) or an admin (docs/phase-2-recurrence-guests.md's guest
  // waiver links task), never to other members viewing the same event.
  waiverToken?: string;
}

export interface RsvpListItem {
  rsvpId: string;
  userId: string;
  displayName: string | null;
  queuePosition: number;
  // Rejected/removed guests are excluded — they're no longer part of the
  // party (docs/phase-2-recurrence-guests.md's "UI for parties" task).
  guests: GuestSummary[];
}

export interface EventDetail {
  event: SerializedEvent;
  // Which group this event belongs to — shown at the top of the event
  // page so a member in several groups isn't left guessing.
  group: { id: string; name: string };
  going: RsvpListItem[];
  waitlist: RsvpListItem[];
  canceled: RsvpListItem[];
  yourRsvp: { status: DerivedStatus | "canceled" | null; queuePosition: number | null };
  // The viewer's role in *this event's* group — not the platform role.
  // Drives which admin controls the UI shows; a platform admin who isn't a
  // group admin here must not see them, and vice versa (policy.md#6).
  viewerRole: "member" | "admin";
  comments: EventCommentItem[];
  // Present only when this instance belongs to a series and the viewer is
  // an admin — drives the series-level cancel actions on the event page
  // (lib/events/series.ts#cancelSeriesWeekday / #cancelSeries). `weekdays`
  // is the series' current set, so a weekday already dropped by a prior
  // per-weekday cancel doesn't show a stale button.
  series: { id: string; weekdays: number[] } | null;
}

export async function getEventDetail(eventId: string, viewer: { id: string }): Promise<EventDetail | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { group: { select: { id: true, name: true } } } });
  if (!event) return null;

  // No active membership in the event's group (and not a platform admin,
  // who has full control over every group — policy.md#6) → treat it
  // exactly like a nonexistent event (architecture.md#groups--tenancy).
  const membership = await resolveGroupMembership(event.groupId, viewer.id);
  if (!membership) return null;

  // Group-admin-ness (or the platform-admin override), not a plain group
  // member — a group member who isn't this group's admin must not see
  // pre-reveal location here (policy.md#6). Phone numbers are never
  // included in this response at all, for any viewer.
  const viewerRole = membership.role;

  const rsvps = await prisma.rsvp.findMany({
    where: { eventId },
    orderBy: { queuePosition: "asc" },
    include: { user: { select: { id: true, displayName: true } } },
  });

  const active = rsvps.filter((r) => r.status === "active");
  const canceled = rsvps.filter((r) => r.status === "canceled");

  const guestCounts = await getApprovedGuestCounts(
    prisma,
    active.map((r) => r.id),
  );
  const guests = await prisma.guest.findMany({
    where: { rsvpId: { in: rsvps.map((r) => r.id) }, approvalStatus: { in: ["pending", "approved"] } },
    orderBy: { createdAt: "asc" },
  });
  const guestsByRsvp = new Map<string, (GuestSummary & { waiverToken: string })[]>();
  for (const g of guests) {
    const list = guestsByRsvp.get(g.rsvpId) ?? [];
    list.push({ id: g.id, name: g.name, approvalStatus: g.approvalStatus as "pending" | "approved", waiverToken: g.waiverToken });
    guestsByRsvp.set(g.rsvpId, list);
  }

  const statuses = computeDerivedStatuses(
    active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: seatsFor(r.id, guestCounts) })),
    event.capacity,
  );

  function toItem(r: (typeof rsvps)[number]): RsvpListItem {
    const showWaiverTokens = viewerRole === "admin" || r.userId === viewer.id;
    const guestsForItem = (guestsByRsvp.get(r.id) ?? []).map((g) =>
      showWaiverTokens ? g : { id: g.id, name: g.name, approvalStatus: g.approvalStatus },
    );
    return {
      rsvpId: r.id,
      userId: r.userId,
      displayName: r.user.displayName,
      queuePosition: r.queuePosition,
      guests: guestsForItem,
    };
  }

  const going = active.filter((r) => statuses.get(r.id) === "going").map(toItem);
  const waitlist = active.filter((r) => statuses.get(r.id) === "waitlist").map(toItem);
  // Canceled rows are never deleted (audit trail) — repeated cancel/re-RSVP
  // cycles for the same user leave one row per cycle. The Canceled list
  // should read as "who's currently not going," not a full history, so:
  // (1) exclude anyone with a fresh active row (the "cancel then re-RSVP"
  // pattern — tests/events-rsvps-schema.test.ts), and (2) collapse repeat
  // cancellations by the same user down to just their most recent one —
  // the DB still holds every row, this is display-only deduping.
  const activeUserIds = new Set(active.map((r) => r.userId));
  const latestCanceledByUser = new Map<string, (typeof canceled)[number]>();
  for (const r of canceled) {
    if (activeUserIds.has(r.userId)) continue;
    const existing = latestCanceledByUser.get(r.userId);
    // queuePosition is a reliable tiebreaker (strictly increasing, unlike
    // canceledAt which two cancels could tie on at millisecond resolution).
    const isNewer =
      !existing ||
      (r.canceledAt ?? new Date(0)) > (existing.canceledAt ?? new Date(0)) ||
      ((r.canceledAt ?? new Date(0)).getTime() === (existing.canceledAt ?? new Date(0)).getTime() &&
        r.queuePosition > existing.queuePosition);
    if (isNewer) {
      latestCanceledByUser.set(r.userId, r);
    }
  }
  const canceledItems = [...latestCanceledByUser.values()].map(toItem);

  const yours = active.find((r) => r.userId === viewer.id);
  const yourRsvp = yours
    ? { status: statuses.get(yours.id) ?? null, queuePosition: yours.queuePosition }
    : {
        status: canceled.some((r) => r.userId === viewer.id) ? ("canceled" as const) : null,
        queuePosition: null,
      };

  const comments = await listComments(eventId);

  const series =
    viewerRole === "admin" && event.seriesId
      ? await prisma.eventSeries.findUnique({ where: { id: event.seriesId }, select: { id: true, weekdays: true } })
      : null;

  return {
    event: serializeEvent(event, viewerRole),
    group: { id: event.group.id, name: event.group.name },
    going,
    waitlist,
    canceled: canceledItems,
    yourRsvp,
    viewerRole,
    comments,
    series,
  };
}

export interface EventListItem {
  event: SerializedEvent;
  seatsRemaining: number | null;
  yourStatus: DerivedStatus | null;
}

export async function listEventsForMember(viewer: { id: string }): Promise<EventListItem[]> {
  const groupIds = await getActiveGroupIds(viewer.id);
  const events = await listUpcomingEvents(groupIds);

  // One membership lookup per group represented, not per event — a member
  // typically belongs to a handful of groups even if they have many events.
  const membershipsByGroup = new Map(
    await Promise.all(
      groupIds.map(async (groupId) => [groupId, await getActiveMembership(groupId, viewer.id)] as const),
    ),
  );

  return Promise.all(
    events.map(async (event) => {
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

      const goingSeats = active
        .filter((r) => statuses.get(r.id) === "going")
        .reduce((sum, r) => sum + seatsFor(r.id, guestCounts), 0);
      const seatsRemaining = event.capacity === null ? null : Math.max(0, event.capacity - goingSeats);

      const yours = active.find((r) => r.userId === viewer.id);
      const yourStatus = yours ? (statuses.get(yours.id) ?? null) : null;

      const viewerRole = membershipsByGroup.get(event.groupId)?.role ?? "member";
      return { event: serializeEvent(event, viewerRole), seatsRemaining, yourStatus };
    }),
  );
}
