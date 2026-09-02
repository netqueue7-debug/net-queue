import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { listActiveMemberships, listPendingMemberships } from "@/lib/groups/groups";

type RouteContext = { params: Promise<{ id: string }> };

// Both the approval queue (pending) and the roster (active, with role) for
// one group — the admin membership page needs both.
export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertGroupAdmin(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [pending, active] = await Promise.all([listPendingMemberships(id), listActiveMemberships(id)]);
  return NextResponse.json({
    pending: pending.map((m) => ({ userId: m.userId, displayName: m.user.displayName, phone: m.user.phone, joinedAt: m.joinedAt })),
    active: active.map((m) => ({ userId: m.userId, displayName: m.user.displayName, phone: m.user.phone, role: m.role })),
  });
}
