import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertCanModerateUser } from "@/lib/groups/authz";
import { getBanPreview } from "@/lib/users/moderation";

type RouteContext = { params: Promise<{ id: string }> };

// What banning this user would cancel — shown before confirming
// (docs/phase-3-polish.md's own check).
export async function GET(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertCanModerateUser(admin.id, id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const preview = await getBanPreview(id);
  return NextResponse.json({ rsvpsToCancel: preview });
}
