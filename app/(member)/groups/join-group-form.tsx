"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

export function JoinGroupForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to join.");
        return;
      }
      setMessage(body.status === "active" ? `Joined ${body.group.name}.` : `Requested to join ${body.group.name} — pending approval.`);
      setCode("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Join code" required className="flex-1" />
        <Button type="submit" loading={loading}>
          Join
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {message && <p className="text-sm text-success">{message}</p>}
    </form>
  );
}
