import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin, getActiveGroupIds, getActiveMembership } from "@/lib/groups/authz";
import { createEventSchema } from "@/lib/events/schema";
import { createEvent, listUpcomingEvents } from "@/lib/events/events";
import { serializeEvent } from "@/lib/serializers/event";

// Lists upcoming events across every group the caller has an active
// membership in — events in other groups are invisible here, not merely
// filtered client-side (architecture.md#groups--tenancy).
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const groupIds = await getActiveGroupIds(user.id);
  const events = await listUpcomingEvents(groupIds);
  const serialized = await Promise.all(
    events.map(async (e) => {
      const membership = await getActiveMembership(e.groupId, user.id);
      return serializeEvent(e, membership?.role ?? "member");
    }),
  );
  return NextResponse.json({ events: serialized });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = createEventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    // Group-admin, not platform-admin (policy.md#6) — being a platform
    // (ops) admin confers no authority to create events in a group you
    // don't administer.
    await assertGroupAdmin(parsed.data.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const event = await createEvent(admin.id, parsed.data);
  return NextResponse.json({ event }, { status: 201 });
}
