import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InvalidPhoneNumberError, sendOtp } from "@/lib/auth/otp";
import { assertOtpSendAllowed, recordOtpSendAttempt, RateLimitExceededError } from "@/lib/auth/rate-limit";
import { assertTurnstileTokenValid, TurnstileVerificationFailedError } from "@/lib/auth/turnstile";

const bodySchema = z.object({
  phone: z.string(),
  turnstileToken: z.string(),
});

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { phone, turnstileToken } = parsed.data;
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

  try {
    await sendOtp(phone);
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to send verification code." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
