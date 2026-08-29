import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAdmin, requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
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
    admin = await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = updateEventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const event = await updateEvent(id, parsed.data, admin.id);
    return NextResponse.json({ event });
  } catch (e) {
    if (isNotFoundError(e)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    throw e;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { id } = await params;
  try {
    const event = await cancelEvent(id);
    return NextResponse.json({ event });
  } catch (e) {
    if (isNotFoundError(e)) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    throw e;
  }
}
