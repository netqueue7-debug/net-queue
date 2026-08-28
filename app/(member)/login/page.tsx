"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Script from "next/script";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const turnstileToken = new FormData(e.currentTarget).get("cf-turnstile-response");

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
      router.push(body.needsOnboarding ? "/onboarding" : "/home");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Log in</h1>

      {step === "phone" && (
        <form onSubmit={handleSendCode} className="flex w-full max-w-sm flex-col gap-4">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Phone number</span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-0100"
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
            />
          </label>
          <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            Send code
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="flex w-full max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Verification code</span>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            Verify
          </button>
        </form>
      )}
    </main>
  );
}
