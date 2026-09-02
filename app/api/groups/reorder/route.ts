import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { reorderMembershipsSchema } from "@/lib/groups/schema";
import { reorderMyMemberships } from "@/lib/groups/groups";
import { MembershipNotFoundError } from "@/lib/groups/errors";

// Persists the caller's own drag-and-drop order for their /groups card
// list — never touches another user's memberships, so there's no
// group-admin check here, just authentication.
export async function PATCH(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = reorderMembershipsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    await reorderMyMemberships(user.id, parsed.data.groupIds);
  } catch (e) {
    if (e instanceof MembershipNotFoundError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  return NextResponse.json({ ok: true });
}
