import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { updateGroupSchema } from "@/lib/groups/schema";
import { updateGroup } from "@/lib/groups/groups";

type RouteContext = { params: Promise<{ id: string }> };

// Group-admin only, and only for *this* group (policy.md#6) — being an
// admin of a different group grants nothing here.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const parsed = updateGroupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await assertGroupAdmin(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const group = await updateGroup(id, parsed.data);
  return NextResponse.json({ group });
}
