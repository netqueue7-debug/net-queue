"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { ErrorText, HelperText } from "@/components/ui/text";

type Step = "phone" | "code";

function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return input;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function PhoneForm({ currentPhone }: { currentPhone: string }) {
  const router = useRouter();
  const [phoneNow, setPhoneNow] = useState(currentPhone);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setEditing(false);
    setStep("phone");
    setPhone("");
    setCode("");
    setError(null);
  }

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/settings/phone/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
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
      const res = await fetch("/api/settings/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Invalid code.");
        return;
      }
      setPhoneNow(phone);
      reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{formatPhone(phoneNow)}</span>
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {step === "phone" && (
        <form onSubmit={handleSendCode} className="flex flex-col gap-3">
          <Field label="New phone number" htmlFor="newPhone">
            <Input id="newPhone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Send code
            </Button>
            <Button type="button" variant="secondary" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
          <HelperText>We sent a code to {formatPhone(phone)}.</HelperText>
          <Field label="Verification code" htmlFor="phoneCode">
            <Input id="phoneCode" type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Verify &amp; save
            </Button>
            <Button type="button" variant="secondary" onClick={reset}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
