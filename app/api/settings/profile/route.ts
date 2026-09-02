import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { updateDisplayName } from "@/lib/settings/profile";

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  await updateDisplayName(user.id, parsed.data.displayName);

  return NextResponse.json({ ok: true });
}
