import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { joinGroupSchema } from "@/lib/groups/schema";
import { joinGroupByCode } from "@/lib/groups/groups";
import { InvalidJoinCodeError, GroupMemberLimitReachedError } from "@/lib/groups/errors";

// Idempotent (policy.md#6) — also the target of the `/join/:code` page's
// own submit, after any login/onboarding detour (architecture.md).
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = joinGroupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const { group, membership } = await joinGroupByCode(user.id, parsed.data.code);
    return NextResponse.json({ group: { id: group.id, name: group.name }, status: membership.status });
  } catch (e) {
    if (e instanceof InvalidJoinCodeError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GroupMemberLimitReachedError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
