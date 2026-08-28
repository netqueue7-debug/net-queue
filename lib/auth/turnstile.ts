const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export class TurnstileVerificationFailedError extends Error {
  constructor() {
    super("Turnstile verification failed.");
    this.name = "TurnstileVerificationFailedError";
  }
}

export async function assertTurnstileTokenValid(token: string, ip: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set.");
  }

  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch(VERIFY_URL, { method: "POST", body });
  const result = (await res.json()) as { success: boolean };

  if (!result.success) {
    throw new TurnstileVerificationFailedError();
  }
}
