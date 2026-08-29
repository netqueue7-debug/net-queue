import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { createEventSchema } from "@/lib/events/schema";
import { createEvent, listUpcomingEvents } from "@/lib/events/events";
import { serializeEvent } from "@/lib/serializers/event";

// Any authenticated member (or admin) can list upcoming events — gated by
// serializeEvent's role-aware location handling, not by route access.
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const events = await listUpcomingEvents();
  return NextResponse.json({ events: events.map((e) => serializeEvent(e, user.role)) });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = createEventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const event = await createEvent(admin.id, parsed.data);
  return NextResponse.json({ event }, { status: 201 });
}
