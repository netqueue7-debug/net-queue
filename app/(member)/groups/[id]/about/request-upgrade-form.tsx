"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

// Shown to a group admin once their group is at its member limit
// (invite-link-card.tsx) — replaces the old "contact a platform admin"
// dead end with a tracked request (lib/groups/upgrade-requests.ts). Still
// no payment step: a platform admin reviews and raises the limit manually
// from /admin/group-upgrade-requests.
export function RequestUpgradeForm({ groupId, hasPendingRequest }: { groupId: string; hasPendingRequest: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [requestedLimit, setRequestedLimit] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (hasPendingRequest || submitted) {
    return <p className="text-sm text-muted">A request to raise this group&apos;s member limit is pending review.</p>;
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/upgrade-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedLimit: requestedLimit.trim() ? Number(requestedLimit) : null,
          message: message.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to submit request.");
        return;
      }
      setSubmitted(true);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" className="w-fit text-sm" onClick={() => setOpen(true)}>
        Request a higher limit
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted">
        Requested limit (optional)
        <Input
          type="number"
          value={requestedLimit}
          onChange={(e) => setRequestedLimit(e.target.value)}
          placeholder="e.g. 50"
          className="mt-1 w-full"
        />
      </label>
      <label className="text-xs text-muted">
        Anything else the platform admin should know? (optional)
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="mt-1 w-full"
        />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button className="text-sm" onClick={handleSubmit} loading={loading}>
          Submit request
        </Button>
        <Button variant="secondary" className="text-sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
