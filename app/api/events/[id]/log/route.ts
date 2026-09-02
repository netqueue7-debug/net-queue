import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { getEventLogTimeline } from "@/lib/admin/event-log";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    await assertGroupAdmin(event.groupId, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const timeline = await getEventLogTimeline(id);
  return NextResponse.json({ timeline });
}
