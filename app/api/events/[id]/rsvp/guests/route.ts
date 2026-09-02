import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { addGuestsSchema } from "@/lib/guests/schema";
import { addGuests } from "@/lib/guests/guests";
import { GuestCapExceededError } from "@/lib/guests/errors";
import { EventNotFoundError, RsvpNotFoundError } from "@/lib/rsvp/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = addGuestsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const guests = await addGuests(id, user.id, parsed.data.names);
    return NextResponse.json({ guests }, { status: 201 });
  } catch (e) {
    if (e instanceof EventNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof RsvpNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GuestCapExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
