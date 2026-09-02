import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { joinGroupAsPlatformAdmin } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string }> };

// Platform-admin only "break glass" self-join — see policy.md#6 and
// lib/groups/groups.ts#joinGroupAsPlatformAdmin. Deliberately gated by
// requireAdmin() (the platform role), not assertGroupAdmin: a real group
// admin of an unrelated group must not be able to use this to hop into
// groups they don't belong to.
export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { id } = await params;

  try {
    const membership = await joinGroupAsPlatformAdmin(id, user.id);
    return NextResponse.json({ role: membership.role, status: membership.status });
  } catch (e) {
    if (e instanceof GroupNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
