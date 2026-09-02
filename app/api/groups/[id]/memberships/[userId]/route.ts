import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { updateMembershipRoleSchema } from "@/lib/groups/schema";
import { updateMembershipRole } from "@/lib/groups/groups";
import { LastAdminError, MembershipNotFoundError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

// Promote/demote an active member's role within this group. Gated the same
// way as approve/reject: group-admin of *this* group, or a platform admin
// via the override (policy.md#6).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id, userId } = await params;
  const parsed = updateMembershipRoleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await assertGroupAdmin(id, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const membership = await updateMembershipRole(id, userId, parsed.data.role);
    return NextResponse.json({ role: membership.role });
  } catch (e) {
    if (e instanceof MembershipNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof LastAdminError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
