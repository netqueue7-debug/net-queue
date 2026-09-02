import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { requestPhoneChange, PhoneAlreadyInUseError, SamePhoneError } from "@/lib/settings/phone";
import { InvalidPhoneNumberError, OtpSendFailedError } from "@/lib/auth/otp";
import { RateLimitExceededError } from "@/lib/auth/rate-limit";

const bodySchema = z.object({
  phone: z.string(),
});

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

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

  try {
    await requestPhoneChange(user, parsed.data.phone, getClientIp(request));
  } catch (e) {
    if (e instanceof InvalidPhoneNumberError || e instanceof SamePhoneError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof PhoneAlreadyInUseError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof RateLimitExceededError) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    if (e instanceof OtpSendFailedError) {
      return NextResponse.json({ error: "Failed to send verification code." }, { status: 502 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
