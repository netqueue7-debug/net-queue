import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupMember } from "@/lib/groups/authz";
import { acceptGroupWaiver } from "@/lib/groups/groups";
import { GroupWaiverNotConfiguredError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string }> };

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertGroupMember(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await acceptGroupWaiver(id, user.id, getClientIp(request));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GroupWaiverNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
