import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOtp, InvalidPhoneNumberError, normalizeUsPhone } from "@/lib/auth/otp";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  phone: z.string(),
  code: z.string(),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { phone, code } = parsed.data;

  let normalized: string;
  try {
    normalized = normalizeUsPhone(phone);
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const approved = await checkOtp(phone, code);
  if (!approved) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { phone: normalized },
    update: {},
    create: { phone: normalized },
  });

  const { token, expiresAt } = await createSession(user.id);

  const response = NextResponse.json({ needsOnboarding: needsOnboarding(user) });
  setSessionCookie(response, token, expiresAt);
  return response;
}
