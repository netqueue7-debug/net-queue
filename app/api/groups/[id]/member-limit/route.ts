import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { updateMemberLimitSchema } from "@/lib/groups/schema";
import { setGroupMemberLimit } from "@/lib/groups/groups";

type RouteContext = { params: Promise<{ id: string }> };

// Platform-admin-only (not group-admin) — a group admin raising their own
// member cap would defeat the point. See lib/groups/schema.ts
// #updateMemberLimitSchema for why this isn't just folded into the
// general PATCH /api/groups/[id] update route.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = updateMemberLimitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const group = await setGroupMemberLimit(id, parsed.data.memberLimit);
  return NextResponse.json({ group });
}
