import { NextRequest, NextResponse } from "next/server";
import { signGuestWaiver } from "@/lib/guests/guests";
import { signGuestWaiverSchema } from "@/lib/guests/schema";
import { GuestNotFoundError } from "@/lib/guests/errors";

type RouteContext = { params: Promise<{ token: string }> };

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// Public — no auth, same as GET. Signing never blocks or affects approval
// (policy.md's derived rules) — it's purely an evidentiary record.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const parsed = signGuestWaiverSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await signGuestWaiver(token, parsed.data.name, getClientIp(request));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GuestNotFoundError) return NextResponse.json({ error: "Invalid waiver link." }, { status: 404 });
    throw e;
  }
}
