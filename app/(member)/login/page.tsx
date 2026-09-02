"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { ErrorText, HelperText } from "@/components/ui/text";

type Step = "phone" | "code";

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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Carries a `/join/:code` (or any other) destination through the OTP
  // round-trip — see docs/phase-0b-groups.md's "single entry point" task.
  const next = searchParams.get("next");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
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

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!turnstileToken) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, turnstileToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to send code.");
        return;
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
        body: JSON.stringify({ phone, code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Invalid code.");
        return;
      }

      const body = await res.json();
      const onboardingUrl = next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding";
      router.push(body.needsOnboarding ? onboardingUrl : (next ?? "/home"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Log in</h1>

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
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" disabled={!turnstileToken} loading={loading}>
            Send code
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="flex w-full max-w-sm flex-col gap-4">
          <Field label="Verification code" htmlFor="code">
            <Input id="code" type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" loading={loading}>
            Verify
          </Button>
        </form>
      )}
    </main>
  );
}
