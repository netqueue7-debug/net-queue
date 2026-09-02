import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { rejectMembership } from "@/lib/groups/groups";
import { MembershipNotFoundError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id, userId } = await params;
  try {
    await assertGroupAdmin(id, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const membership = await rejectMembership(id, userId);
    return NextResponse.json({ status: membership.status });
  } catch (e) {
    if (e instanceof MembershipNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
