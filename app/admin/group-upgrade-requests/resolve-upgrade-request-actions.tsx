"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

// Approve applies `newLimit` to the group's memberLimit in the same call
// (lib/groups/upgrade-requests.ts#resolveUpgradeRequest) — pre-filled with
// the group's requested number but editable, since the platform admin's
// actual decision (a plan tier, a negotiated number) doesn't have to match
// what was asked for verbatim.
export function ResolveUpgradeRequestActions({
  requestId,
  requestedLimit,
  currentMemberLimit,
}: {
  requestId: string;
  requestedLimit: number | null;
  currentMemberLimit: number | null;
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);
  const [newLimit, setNewLimit] = useState((requestedLimit ?? currentMemberLimit ?? "").toString());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolve(decision: "approved" | "denied") {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/group-upgrade-requests/${requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          ...(decision === "approved" ? { newLimit: newLimit.trim() ? Number(newLimit) : null } : {}),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to resolve request.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (approving) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          value={newLimit}
          onChange={(e) => setNewLimit(e.target.value)}
          placeholder="Unlimited"
          className="w-24 py-1 text-sm"
        />
        <Button className="px-2 py-1 text-xs" onClick={() => resolve("approved")} loading={loading}>
          Confirm approve
        </Button>
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setApproving(false)}>
          Cancel
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="affirmative-link" disabled={loading} onClick={() => setApproving(true)}>
        Approve
      </Button>
      <Button variant="destructive-link" disabled={loading} onClick={() => resolve("denied")}>
        Deny
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
