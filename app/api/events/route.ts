import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { createEventSchema } from "@/lib/events/schema";
import { createEvent, listEvents } from "@/lib/events/events";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const events = await listEvents();
  return NextResponse.json({ events });
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
