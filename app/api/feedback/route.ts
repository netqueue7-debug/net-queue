import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { submitFeedbackSchema } from "@/lib/feedback/schema";
import { createFeedback } from "@/lib/feedback/feedback";

// Any logged-in member can submit — not group-scoped, no group
// membership check needed (docs/architecture.md#groups--tenancy).
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = submitFeedbackSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const feedback = await createFeedback(user.id, parsed.data.type, parsed.data.body);
  return NextResponse.json({ feedback }, { status: 201 });
}
