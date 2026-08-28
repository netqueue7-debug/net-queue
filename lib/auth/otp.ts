import twilio from "twilio";

export class InvalidPhoneNumberError extends Error {
  constructor(phone: string) {
    super(`"${phone}" is not a valid US phone number.`);
    this.name = "InvalidPhoneNumberError";
  }
}

export class OtpSendFailedError extends Error {
  constructor(cause: unknown) {
    super("Failed to send verification code.");
    this.name = "OtpSendFailedError";
    this.cause = cause;
  }
}

export class OtpCheckFailedError extends Error {
  constructor(cause: unknown) {
    super("Failed to check verification code.");
    this.name = "OtpCheckFailedError";
    this.cause = cause;
  }
}

// US/Canada NANP numbers only: 10 digits, area code and exchange
// can't start with 0 or 1. Accepts a bare 10-digit number, an 11-digit
// number with a leading country code "1", or an already-E.164 "+1..." form.
export function normalizeUsPhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    throw new InvalidPhoneNumberError(input);
  }

  return `+1${digits}`;
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

export async function sendOtp(phone: string): Promise<void> {
  const normalized = normalizeUsPhone(phone);
  const client = getTwilioClient();

  try {
    await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verifications.create({ to: normalized, channel: "sms" });
  } catch (cause) {
    throw new OtpSendFailedError(cause);
  }
}

export async function checkOtp(phone: string, code: string): Promise<boolean> {
  const normalized = normalizeUsPhone(phone);
  const client = getTwilioClient();

  try {
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: normalized, code });

    return check.status === "approved";
  } catch (cause) {
    throw new OtpCheckFailedError(cause);
  }
}
