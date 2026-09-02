import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/notifications/notifications";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  await markAllNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
