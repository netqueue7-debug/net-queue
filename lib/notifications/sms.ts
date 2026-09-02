import twilio from "twilio";

export class SmsSendError extends Error {
  constructor(cause: unknown) {
    super("Failed to send SMS.");
    this.name = "SmsSendError";
    this.cause = cause;
  }
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Twilio Messages API (not Verify — that's OTP-only, see lib/auth/otp.ts).
// Requires TWILIO_MESSAGING_SERVICE_SID, a separate piece of Twilio setup
// from OTP's Verify Service SID (docs/runbook.md). Until it's configured,
// every send throws here — which is the *correct* degrade: the caller
// (lib/notifications/notifications.ts#dispatchNotification) logs it and
// retries later, never touching the queue mutation that triggered it.
export async function sendSms(to: string, body: string): Promise<void> {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!messagingServiceSid) {
    throw new SmsSendError(new Error("TWILIO_MESSAGING_SERVICE_SID is not configured."));
  }

  try {
    await getTwilioClient().messages.create({ to, messagingServiceSid, body });
  } catch (cause) {
    throw new SmsSendError(cause);
  }
}
