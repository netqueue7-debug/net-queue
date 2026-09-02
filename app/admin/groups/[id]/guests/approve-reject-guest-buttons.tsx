"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ApproveRejectGuestButtons({ guestId }: { guestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function decide(action: "approve" | "reject") {
    setLoading(true);
    try {
      await fetch(`/api/guests/${guestId}/${action}`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-3">
      <Button variant="affirmative-link" disabled={loading} onClick={() => decide("approve")}>
        Approve
      </Button>
      <Button variant="destructive-link" disabled={loading} onClick={() => decide("reject")}>
        Reject
      </Button>
    </div>
  );
}
