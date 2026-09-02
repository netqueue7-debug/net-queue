import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { checkOtp, normalizeUsPhone, sendOtp } from "@/lib/auth/otp";
import { assertOtpSendAllowed, recordOtpSendAttempt } from "@/lib/auth/rate-limit";

export class PhoneAlreadyInUseError extends Error {
  constructor() {
    super("That phone number is already in use by another account.");
    this.name = "PhoneAlreadyInUseError";
  }
}

export class SamePhoneError extends Error {
  constructor() {
    super("That's already your phone number.");
    this.name = "SamePhoneError";
  }
}

export class InvalidOtpError extends Error {
  constructor() {
    super("Invalid or expired code.");
    this.name = "InvalidOtpError";
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Step 1 of a phone-number change: normalizes and pre-checks uniqueness
// (so we never text a code to a number already tied to another account),
// then reuses the same rate-limited Twilio Verify send as login — the
// per-phone/per-IP/global limits in lib/auth/rate-limit.ts are what
// satisfy CLAUDE.md's "every OTP-sending endpoint is rate-limited"
// invariant here; Turnstile is skipped because this endpoint is already
// gated behind an authenticated session, unlike the anonymous login flow.
export async function requestPhoneChange(currentUser: { id: string; phone: string }, newPhoneRaw: string, ip: string): Promise<void> {
  const normalized = normalizeUsPhone(newPhoneRaw);

  if (normalized === currentUser.phone) throw new SamePhoneError();

  const existing = await prisma.user.findUnique({ where: { phone: normalized }, select: { id: true } });
  if (existing && existing.id !== currentUser.id) throw new PhoneAlreadyInUseError();

  await assertOtpSendAllowed(normalized, ip);
  await recordOtpSendAttempt(normalized, ip);
  await sendOtp(normalized);
}

// Step 2: verify the code and swap the phone in place. The unique
// constraint is re-checked at the DB level (not just the pre-check above)
// to close the race where two accounts request the same number at once.
export async function confirmPhoneChange(userId: string, newPhoneRaw: string, code: string): Promise<void> {
  const normalized = normalizeUsPhone(newPhoneRaw);

  const approved = await checkOtp(normalized, code);
  if (!approved) throw new InvalidOtpError();

  try {
    await prisma.user.update({ where: { id: userId }, data: { phone: normalized } });
  } catch (e) {
    if (isUniqueConstraintError(e)) throw new PhoneAlreadyInUseError();
    throw e;
  }
}
