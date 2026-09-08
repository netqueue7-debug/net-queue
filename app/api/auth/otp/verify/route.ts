import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOtp, InvalidPhoneNumberError, normalizeUsPhone } from "@/lib/auth/otp";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { hasActiveSmsConsent, SMS_CONSENT_REQUIRED_ERROR, SMS_CONSENT_VERSION } from "@/lib/auth/sms-consent";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  phone: z.string(),
  code: z.string(),
  // TCR/A2P 10DLC consent, captured at the phone-entry step and re-sent
  // here so it can be persisted at the moment the user row is actually
  // created (see comment below — no user row exists before this). Only
  // required when this phone has no active consent on file — see
  // hasActiveSmsConsent.
  smsConsent: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { phone, code, smsConsent } = parsed.data;

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

  const existing = await prisma.user.findUnique({
    where: { phone: normalized },
    select: { smsConsentAt: true, smsOptedOutAt: true },
  });
  if (!hasActiveSmsConsent(existing) && !smsConsent) {
    return NextResponse.json({ error: SMS_CONSENT_REQUIRED_ERROR }, { status: 400 });
  }
  // A previously opted-out number giving fresh consent here re-stamps it
  // and clears the opt-out — anyone else (a first-ever signup, or an
  // already-consented returning user) leaves the row's consent fields
  // exactly as they were: only ever set on create, never re-stamped.
  const reconsenting = existing?.smsOptedOutAt != null && smsConsent;

  const user = await prisma.user.upsert({
    where: { phone: normalized },
    update: reconsenting
      ? { smsOptedOutAt: null, smsConsentAt: new Date(), smsConsentVersion: SMS_CONSENT_VERSION }
      : {},
    create: { phone: normalized, smsConsentAt: new Date(), smsConsentVersion: SMS_CONSENT_VERSION },
  });

  const { token, expiresAt } = await createSession(user.id);

  const response = NextResponse.json({ needsOnboarding: needsOnboarding(user) });
  setSessionCookie(response, token, expiresAt);
  return response;
}
