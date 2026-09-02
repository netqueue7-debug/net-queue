import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getEvent } from "@/lib/events/events";
import { serializeEvent } from "@/lib/serializers/event";
import { buildIcsEvent } from "@/lib/calendar/ics";

type RouteContext = { params: Promise<{ id: string }> };

// Same "indistinguishable from a nonexistent event" treatment as the rest
// of the RSVP/event-detail surface for a caller with no membership in the
// event's group (docs/phase-0b-groups.md) — 404, not 403.
export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const membership = await resolveGroupMembership(event.groupId, user.id);
  if (!membership) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  // Routed through the same viewer-role-gated serializer as the event
  // detail page — exact location is never included here before its
  // reveal time, same invariant as everywhere else it's ever sent to a
  // client (docs/architecture.md#location-gating). This file is a static
  // snapshot at download time, so a calendar app that imports it (rather
  // than subscribing to a live feed) won't see the location update itself
  // once it's revealed — re-downloading after reveal picks it up.
  const serialized = serializeEvent(event, membership.role);
  const location = serialized.exactLocation ?? serialized.generalLocation ?? undefined;

  const ics = buildIcsEvent({
    uid: event.id,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    title: event.title,
    description: event.description,
    location,
  });

  const safeName = event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "event";

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.ics"`,
    },
  });
}
