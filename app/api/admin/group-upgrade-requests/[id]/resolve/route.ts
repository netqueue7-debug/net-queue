import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { resolveUpgradeRequestSchema } from "@/lib/groups/schema";
import { resolveUpgradeRequest } from "@/lib/groups/upgrade-requests";
import { UpgradeRequestNotFoundError } from "@/lib/groups/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = resolveUpgradeRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  try {
    const upgradeRequest = await resolveUpgradeRequest(id, admin.id, parsed.data);
    return NextResponse.json({ upgradeRequest });
  } catch (e) {
    if (e instanceof UpgradeRequestNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
