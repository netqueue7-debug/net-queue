// SMS program consent copy shown at the phone-entry step of /login, for
// TCR/A2P 10DLC campaign registration. Bump SMS_CONSENT_VERSION if this
// text materially changes what a subscriber is agreeing to — existing
// smsConsentVersion values on users then reflect the version they actually
// saw, mirroring the old waiver-versioning pattern (docs/phase-0-foundations.md).
export const SMS_CONSENT_VERSION = 1;

export const SMS_PROGRAM_NAME = "NetQueue";

export const SMS_MESSAGE_TYPES_DESCRIPTION =
  "By checking this box and continuing, you agree to receive SMS text messages from " +
  `${SMS_PROGRAM_NAME} related to your event RSVPs — including your one-time login code, ` +
  "waitlist promotion/demotion alerts, and event cancellations or changes to time/location.";

export const SMS_FREQUENCY_DISCLOSURE = "Message frequency varies based on your event activity.";

export const SMS_RATES_DISCLOSURE = "Message and data rates may apply.";

export const SMS_HELP_STOP_DISCLOSURE = "Reply HELP for help. Reply STOP to opt out at any time.";

// A phone number only needs to see the consent checkbox once: the first
// time it ever completes login, and again after a STOP reply revokes it.
// Everywhere else (login/route handlers) treats this as the single source
// of truth instead of re-deriving the smsConsentAt/smsOptedOutAt check.
export function hasActiveSmsConsent(
  user: { smsConsentAt: Date | null; smsOptedOutAt: Date | null } | null | undefined,
): boolean {
  return !!user?.smsConsentAt && !user.smsOptedOutAt;
}

// The machine-readable error code returned by /api/auth/otp/send and
// /api/auth/otp/verify when the checkbox needs to be (re-)checked — the
// login page keys off this exact string to reveal/require consent.
export const SMS_CONSENT_REQUIRED_ERROR = "consent_required";
