"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

export function NameForm({ initialDisplayName }: { initialDisplayName: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to save.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        id="displayName"
        aria-label="Display name"
        type="text"
        required
        maxLength={80}
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setSaved(false);
        }}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={loading} disabled={!displayName.trim() || displayName === initialDisplayName}>
          Save
        </Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>
  );
}
