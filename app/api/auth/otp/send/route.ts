import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InvalidPhoneNumberError, normalizeUsPhone, sendOtp } from "@/lib/auth/otp";
import { assertOtpSendAllowed, recordOtpSendAttempt, RateLimitExceededError } from "@/lib/auth/rate-limit";
import { assertTurnstileTokenValid, TurnstileVerificationFailedError } from "@/lib/auth/turnstile";
import { hasActiveSmsConsent, SMS_CONSENT_REQUIRED_ERROR } from "@/lib/auth/sms-consent";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  phone: z.string(),
  turnstileToken: z.string(),
  // TCR/A2P 10DLC: the OTP itself is an SMS send, so consent must be given
  // before it goes out — but only when this number hasn't already given it
  // (or has since opted out via a STOP reply). See hasActiveSmsConsent.
  smsConsent: z.boolean().optional().default(false),
});

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { phone, turnstileToken, smsConsent } = parsed.data;
  const ip = getClientIp(request);

  try {
    await assertTurnstileTokenValid(turnstileToken, ip);
  } catch (e) {
    if (e instanceof TurnstileVerificationFailedError) {
      return NextResponse.json({ error: "Verification failed." }, { status: 400 });
    }
    throw e;
  }

  try {
    await assertOtpSendAllowed(phone, ip);
  } catch (e) {
    if (e instanceof RateLimitExceededError) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    throw e;
  }

  await recordOtpSendAttempt(phone, ip);

  let normalized: string;
  try {
    normalized = normalizeUsPhone(phone);
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const user = await prisma.user.findUnique({
    where: { phone: normalized },
    select: { smsConsentAt: true, smsOptedOutAt: true },
  });
  if (!hasActiveSmsConsent(user) && !smsConsent) {
    return NextResponse.json({ error: SMS_CONSENT_REQUIRED_ERROR }, { status: 400 });
  }

  try {
    await sendOtp(phone);
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to send verification code." }, { status: 502 });
  }

  // Lets /signup tell someone who already has an account that they didn't
  // need to sign up again, without an extra round trip or blocking the
  // send — signing up again is harmless, just redundant.
  return NextResponse.json({ ok: true, hasAccount: user !== null });
}
