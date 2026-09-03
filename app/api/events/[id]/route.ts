import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { updateEventSchema } from "@/lib/events/schema";
import { cancelEvent, updateEvent } from "@/lib/events/events";
import { getEventDetail } from "@/lib/rsvp/event-detail";

type RouteContext = { params: Promise<{ id: string }> };

function isNotFoundError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}

// Any authenticated member (or admin) can view an event's detail page —
// going/waitlist/canceled lists, their own status, and location gated by
// serializeEvent. Phone numbers are only included in the RSVP lists for
// admin viewers (architecture.md#cross-cutting-concerns).
export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const detail = await getEventDetail(id, user);
  if (!detail) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = updateEventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    // Group-admin of *this event's* group, not platform-admin (policy.md#6).
    await assertGroupAdmin(existing.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    // A single-occurrence edit is always a hand-edit — mark it overridden
    // so a later series-wide edit skips it (docs/phase-2-recurrence-guests.md's
    // "this event vs. all following" model). Harmless on a standalone,
    // non-series event: overridden is never read there.
    const event = await updateEvent(id, parsed.data, admin.id, { markOverridden: true });
    return NextResponse.json({ event });
  } catch (e) {
    if (isNotFoundError(e)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    throw e;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const existing = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!existing) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    await assertGroupAdmin(existing.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const event = await cancelEvent(id, admin.id);
    return NextResponse.json({ event });
  } catch (e) {
    if (isNotFoundError(e)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    throw e;
  }
}
