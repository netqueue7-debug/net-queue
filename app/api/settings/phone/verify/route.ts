import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { confirmPhoneChange, InvalidOtpError, PhoneAlreadyInUseError } from "@/lib/settings/phone";
import { InvalidPhoneNumberError } from "@/lib/auth/otp";

const bodySchema = z.object({
  phone: z.string(),
  code: z.string(),
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

  try {
    await confirmPhoneChange(user.id, parsed.data.phone, parsed.data.code);
  } catch (e) {
    if (e instanceof InvalidOtpError || e instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof PhoneAlreadyInUseError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
