"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WAIVER_MARKDOWN } from "@/lib/waivers/content";

export function OnboardingForm() {
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

      router.push("/home");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Welcome — one last step</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Display name</span>
          <input
            type="text"
            required
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
          />
        </label>

        <div className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-zinc-700 dark:text-zinc-300">
            {WAIVER_MARKDOWN}
          </pre>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          I have read and accept the waiver above.
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !accepted}
          className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
