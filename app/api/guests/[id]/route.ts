import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { removeGuest } from "@/lib/guests/guests";
import { GuestNotFoundError } from "@/lib/guests/errors";

type RouteContext = { params: Promise<{ id: string }> };

// Host removal needs no approval (policy.md's derived rules) — the only
// authz question is *whose* guest this is. An admin of the event's group
// can remove any guest on it too (the same admin-removal pattern as
// DELETE /api/admin/events/:id/rsvp for a whole RSVP).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const guest = await prisma.guest.findUnique({ where: { id }, include: { rsvp: { include: { event: true } } } });
  if (!guest) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

  const isHost = guest.rsvp.userId === user.id;
  if (!isHost) {
    try {
      await assertGroupAdmin(guest.rsvp.event.groupId, user.id);
    } catch (e) {
      if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
      throw e;
    }
  }

  try {
    const removed = await removeGuest(id, user.id);
    return NextResponse.json({ guest: removed });
  } catch (e) {
    if (e instanceof GuestNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
