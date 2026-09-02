"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WAIVER_MARKDOWN } from "@/lib/waivers/content";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { Card } from "@/components/ui/card";
import { ErrorText } from "@/components/ui/text";

export function OnboardingForm({ next }: { next?: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, waiverAccepted: accepted }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to complete onboarding.");
        return;
      }

      router.push(next ?? "/home");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Welcome — one last step</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Display name" htmlFor="displayName">
          <Input
            id="displayName"
            type="text"
            required
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>

        <Card>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted">{WAIVER_MARKDOWN}</pre>
        </Card>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          I have read and accept the waiver above.
        </label>

        {error && <ErrorText>{error}</ErrorText>}

        <Button type="submit" disabled={!accepted} loading={loading}>
          Continue
        </Button>
      </form>
    </main>
  );
}
