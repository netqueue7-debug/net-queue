import { NextRequest, NextResponse } from "next/server";
import { getGuestByWaiverToken } from "@/lib/guests/guests";

type RouteContext = { params: Promise<{ token: string }> };

// Public — no auth. The token itself (32 bytes, unguessable) is the only
// credential, per architecture.md's guest waiver design.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const guest = await getGuestByWaiverToken(token);
  if (!guest) return NextResponse.json({ error: "Invalid waiver link." }, { status: 404 });

  return NextResponse.json(guest);
}
