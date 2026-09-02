import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { adminAddGuestsSchema } from "@/lib/guests/schema";
import { adminAddGuests } from "@/lib/guests/guests";
import { RsvpNotFoundError } from "@/lib/rsvp/errors";

type RouteContext = { params: Promise<{ id: string }> };

// Admin-added guests skip approval entirely and are exempt from the guest
// cap (policy.md#5) — created directly `approved`, attached to the named
// host's existing queue position.
export async function POST(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = adminAddGuestsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    await assertGroupAdmin(event.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const guests = await adminAddGuests(id, parsed.data.userId, parsed.data.names, admin.id);
    return NextResponse.json({ guests }, { status: 201 });
  } catch (e) {
    if (e instanceof RsvpNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
