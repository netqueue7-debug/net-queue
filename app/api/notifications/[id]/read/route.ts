import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/notifications/notifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  // Scoped to the caller at the query level (lib/notifications/notifications.ts)
  // — a notification id belonging to someone else is silently a no-op, not
  // a 403/404 that would reveal whether the id exists at all.
  await markNotificationRead(id, user.id);
  return NextResponse.json({ ok: true });
}
