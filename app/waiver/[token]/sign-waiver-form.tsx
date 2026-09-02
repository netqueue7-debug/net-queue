"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

export function SignWaiverForm({ token, initialName }: { token: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/waiver/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to sign.");
        return;
      }
      setSigned(true);
    } finally {
      setLoading(false);
    }
  }

  if (signed) {
    return <p className="text-success">Thanks, {name} — you&apos;re all set.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Your name" htmlFor="name">
        <Input id="name" type="text" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        I have read and accept the waiver above.
      </label>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" disabled={!accepted} loading={loading}>
        Sign waiver
      </Button>
    </form>
  );
}
