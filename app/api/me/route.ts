import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const user = await requireMember(request);
    return NextResponse.json({ id: user.id, phone: user.phone, displayName: user.displayName, role: user.role });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }
}
