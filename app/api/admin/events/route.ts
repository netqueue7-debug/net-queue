import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { listEvents } from "@/lib/events/events";

// Unfiltered (includes canceled) admin management listing for one group —
// there is no unscoped "every event" listing anymore (docs/phase-0b-groups.md).
// The member-facing GET /api/events only shows scheduled, upcoming events,
// across every group the caller belongs to.
export async function GET(request: NextRequest) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId query parameter is required." }, { status: 400 });
  }

  try {
    await assertGroupAdmin(groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const events = await listEvents(groupId);
  return NextResponse.json({ events });
}
