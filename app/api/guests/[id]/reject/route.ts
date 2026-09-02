import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { rejectGuest } from "@/lib/guests/guests";
import { GuestNotFoundError } from "@/lib/guests/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const guest = await prisma.guest.findUnique({ where: { id }, include: { rsvp: { include: { event: true } } } });
  if (!guest) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

  try {
    await assertGroupAdmin(guest.rsvp.event.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const rejected = await rejectGuest(id, admin.id);
    return NextResponse.json({ guest: rejected });
  } catch (e) {
    if (e instanceof GuestNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
