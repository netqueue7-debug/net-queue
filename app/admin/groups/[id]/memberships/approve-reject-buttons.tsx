"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";

export function ApproveRejectButtons({ groupId, userId }: { groupId: string; userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/memberships/${userId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        <Button variant="affirmative-link" disabled={loading} onClick={() => decide("approve")}>
          Approve
        </Button>
        <Button variant="destructive-link" disabled={loading} onClick={() => decide("reject")}>
          Reject
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
