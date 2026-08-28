import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { cancelRsvp, createRsvp } from "@/lib/rsvp/rsvp";
import {
  AlreadyRsvpedError,
  EventCanceledError,
  RsvpNotFoundError,
  SignupNotOpenError,
  UserBannedError,
  WaiverNotAcceptedError,
} from "@/lib/rsvp/errors";

type RouteContext = { params: Promise<{ id: string }> };

function mapRsvpError(e: unknown): NextResponse | null {
  if (e instanceof SignupNotOpenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof EventCanceledError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof UserBannedError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof WaiverNotAcceptedError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof AlreadyRsvpedError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof RsvpNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  return null;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    const rsvp = await createRsvp(id, user.id);
    return NextResponse.json({ rsvp }, { status: 201 });
  } catch (e) {
    const mapped = mapRsvpError(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    const rsvp = await cancelRsvp(id, user.id);
    return NextResponse.json({ rsvp });
  } catch (e) {
    const mapped = mapRsvpError(e);
    if (mapped) return mapped;
    throw e;
  }
}
