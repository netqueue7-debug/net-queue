"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { ErrorText, HelperText } from "@/components/ui/text";
import {
  SMS_CONSENT_REQUIRED_ERROR,
  SMS_FREQUENCY_DISCLOSURE,
  SMS_HELP_STOP_DISCLOSURE,
  SMS_MESSAGE_TYPES_DESCRIPTION,
  SMS_RATES_DISCLOSURE,
} from "@/lib/auth/sms-consent";

type Step = "phone" | "code";
export type AuthMode = "login" | "signup";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
      ) => string;
    };
  }
}

// /login never shows the SMS consent checkbox — it's for a number that's
// already given it. /signup always shows it and always sends it. Neither
// page ever needs to reveal the checkbox mid-flow: a /login attempt from a
// number that turns out to need consent (brand new, or opted out via a
// STOP reply) is bounced to /signup with its phone carried over, rather
// than growing a second consent UI on this page.
export default function AuthForm({ mode }: { mode: AuthMode }) {
  const searchParams = useSearchParams();
  // Carries a `/join/:code` (or any other) destination through the OTP
  // round-trip — see docs/phase-0b-groups.md's "single entry point" task.
  const next = searchParams.get("next");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(searchParams.get("phone") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  // Non-blocking, informational — as opposed to `error`, which blocks
  // progress. Used for "you already have an account" (/signup) and "no
  // account yet, here's a link" (/login) — neither should stop someone
  // from continuing if that's genuinely what they meant to do.
  const [notice, setNotice] = useState<string | null>(null);
  const [signupHref, setSignupHref] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  function renderTurnstile() {
    const container = turnstileContainerRef.current;
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!container || !sitekey || !window.turnstile) return;
    window.turnstile.render(container, {
      sitekey,
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
    });
  }

  // Doesn't navigate — surfaces a link and lets the person decide. An
  // instant auto-redirect away from /login before they've read why would
  // be a jarring surprise; this way the phone number they already typed
  // (and `next`) still carry over the moment they click through.
  function offerSignupInstead() {
    const params = new URLSearchParams({ phone });
    if (next) params.set("next", next);
    setSignupHref(`/signup?${params.toString()}`);
    setError("We don't have an account for that number yet.");
  }

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstileToken) return;
    setError(null);
    setNotice(null);
    setSignupHref(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, turnstileToken, smsConsent: mode === "signup" && smsConsent }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (mode === "login" && body.error === SMS_CONSENT_REQUIRED_ERROR) {
          offerSignupInstead();
          return;
        }
        setError(body.error ?? "Failed to send code.");
        return;
      }

      const body = await res.json();
      if (mode === "signup" && body.hasAccount) {
        setNotice("Looks like you already have an account for that number — we texted your login code.");
      }
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, smsConsent: mode === "signup" && smsConsent }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (mode === "login" && body.error === SMS_CONSENT_REQUIRED_ERROR) {
          // Only reachable if consent was revoked (a STOP reply) in the
          // few seconds between send and verify.
          offerSignupInstead();
          return;
        }
        setError(body.error ?? "Invalid code.");
        return;
      }

      const body = await res.json();
      const onboardingUrl = next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
      // A hard navigation (not router.push + router.refresh) so the shared
      // root layout's Nav re-renders with the freshly-set session cookie.
      // The cookie is set by a Route Handler, not a Server Action, so Next
      // doesn't auto-invalidate the client router cache for it — see the
      // login flow investigation in project history for the race this avoids.
      window.location.href = body.needsOnboarding ? onboardingUrl : (next ?? "/home");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">{mode === "signup" ? "Sign up" : "Log in"}</h1>

      {step === "phone" && (
        <form onSubmit={handleSendCode} className="flex w-full max-w-sm flex-col gap-4">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onLoad={renderTurnstile} />
          <Field label="Phone number" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-0100"
            />
          </Field>
          <div ref={turnstileContainerRef} />
          {!turnstileToken && <HelperText>Waiting for verification to finish loading…</HelperText>}

          {mode === "signup" && (
            <>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>{SMS_MESSAGE_TYPES_DESCRIPTION}</p>
                <p>
                  {SMS_FREQUENCY_DISCLOSURE} {SMS_RATES_DISCLOSURE} {SMS_HELP_STOP_DISCLOSURE}
                </p>
                <p>
                  See our{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                />
                I agree to receive SMS messages from NetQueue as described above, and I agree to the Terms of Service
                and Privacy Policy.
              </label>
            </>
          )}

          {error && <ErrorText>{error}</ErrorText>}
          {signupHref && (
            <HelperText>
              <a href={signupHref} className="underline">
                Sign up instead →
              </a>
            </HelperText>
          )}
          <Button type="submit" disabled={!turnstileToken || (mode === "signup" && !smsConsent)} loading={loading}>
            {mode === "signup" ? "Yes, sign me up!" : "Send code"}
          </Button>

          {mode === "login" ? (
            <p className="text-center text-sm text-muted">
              No account yet?{" "}
              <a href="/signup" className="underline">
                Sign up
              </a>
            </p>
          ) : (
            <p className="text-center text-sm text-muted">
              Already have an account?{" "}
              <a href="/login" className="underline">
                Log in
              </a>
            </p>
          )}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="flex w-full max-w-sm flex-col gap-4">
          {notice && <HelperText>{notice}</HelperText>}
          <Field label="Verification code" htmlFor="code">
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          {signupHref && (
            <HelperText>
              <a href={signupHref} className="underline">
                Sign up instead →
              </a>
            </HelperText>
          )}
          <Button type="submit" loading={loading}>
            Verify
          </Button>
        </form>
      )}
    </main>
  );
}
