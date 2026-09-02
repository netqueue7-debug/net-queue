import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { cancelRsvp } from "@/lib/rsvp/rsvp";
import { RsvpNotFoundError } from "@/lib/rsvp/errors";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ userId: z.string() });

// Admin removing a member's RSVP goes through the same cancelRsvp path as a
// self-cancel (same promotion behavior) — just with the admin as the
// event_log actor instead of the RSVP's own owner.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    // Group-admin of this event's group, not platform-admin (policy.md#6).
    await assertGroupAdmin(event.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const rsvp = await cancelRsvp(id, parsed.data.userId, admin.id);
    return NextResponse.json({ rsvp });
  } catch (e) {
    if (e instanceof RsvpNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
