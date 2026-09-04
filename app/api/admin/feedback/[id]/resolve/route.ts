import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { resolveFeedback } from "@/lib/feedback/feedback";
import { FeedbackNotFoundError } from "@/lib/feedback/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { id } = await params;
  try {
    const feedback = await resolveFeedback(id);
    return NextResponse.json({ feedback });
  } catch (e) {
    if (e instanceof FeedbackNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
