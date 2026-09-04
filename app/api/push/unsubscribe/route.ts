import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { unsubscribePushSchema } from "@/lib/notifications/push-schema";
import { removeSubscription } from "@/lib/notifications/push";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = unsubscribePushSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  await removeSubscription(user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
