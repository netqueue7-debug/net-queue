import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { createUpgradeRequestSchema } from "@/lib/groups/schema";
import { requestGroupUpgrade } from "@/lib/groups/upgrade-requests";
import { UpgradeRequestAlreadyPendingError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string }> };

// Group-admin only, and only for *this* group (policy.md#6) — same
// authz shape as PATCH /api/groups/[id]. requestGroupUpgrade itself does
// the assertGroupAdmin check, so a bad actor gets a 403 there too.
export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = createUpgradeRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const upgradeRequest = await requestGroupUpgrade(id, user.id, parsed.data);
    return NextResponse.json({ upgradeRequest }, { status: 201 });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof UpgradeRequestAlreadyPendingError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
