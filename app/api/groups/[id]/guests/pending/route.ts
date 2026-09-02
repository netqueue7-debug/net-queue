import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { listPendingGuestsForGroup } from "@/lib/guests/guests";

type RouteContext = { params: Promise<{ id: string }> };

// The approval queue: every pending guest across this group's upcoming
// events (docs/phase-2-recurrence-guests.md).
export async function GET(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertGroupAdmin(id, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const pending = await listPendingGuestsForGroup(id);
  return NextResponse.json({
    pending: pending.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      hostDisplayName: g.rsvp.user.displayName,
      eventId: g.rsvp.event.id,
      eventTitle: g.rsvp.event.title,
      eventStartsAt: g.rsvp.event.startsAt,
    })),
  });
}
