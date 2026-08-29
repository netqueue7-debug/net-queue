import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { listEvents } from "@/lib/events/events";

// Unfiltered (includes canceled) admin management listing — the
// member-facing GET /api/events only shows scheduled, upcoming events.
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
