import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { createSeriesSchema } from "@/lib/events/series-schema";
import { createSeries, listSeriesForGroup } from "@/lib/events/series";

// Admin-only listing for one group, same shape as GET /api/admin/events —
// there's no unscoped "every series" listing (docs/phase-0b-groups.md).
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId query parameter is required." }, { status: 400 });
  }

  try {
    await assertGroupAdmin(groupId, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const series = await listSeriesForGroup(groupId);
  return NextResponse.json({ series });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = createSeriesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    // Group-admin, not platform-admin (policy.md#6) — mirrors POST /api/events.
    await assertGroupAdmin(parsed.data.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { series, eventsCreated } = await createSeries(admin.id, parsed.data);
  return NextResponse.json({ series, eventsCreated }, { status: 201 });
}
