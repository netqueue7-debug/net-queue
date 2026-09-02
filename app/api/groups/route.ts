import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { InvalidPhoneNumberError } from "@/lib/auth/otp";
import { createGroupSchema } from "@/lib/groups/schema";
import { createGroup, listMyMemberships } from "@/lib/groups/groups";

// Every group the caller has a membership in (any status) — the basis for
// a group switcher. Distinguishes pending/rejected from active so the UI
// can show "pending approval" rather than just omitting the group.
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const memberships = await listMyMemberships(user.id);
  return NextResponse.json({
    groups: memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      role: m.role,
      status: m.status,
      waiverUpToDate: m.waiverUpToDate,
    })),
  });
}

// Platform-admin-only (policy.md#6) — group creation is not self-serve.
// The body names the phone of the user to install as the group's first
// admin, which is usually not the platform admin making this call.
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = createGroupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const group = await createGroup(admin.id, parsed.data);
    return NextResponse.json({ group }, { status: 201 });
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
