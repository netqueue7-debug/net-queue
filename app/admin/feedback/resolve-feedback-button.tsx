"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ResolveFeedbackButton({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleResolve() {
    setLoading(true);
    try {
      await fetch(`/api/admin/feedback/${feedbackId}/resolve`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="affirmative-link" disabled={loading} onClick={handleResolve}>
      Mark resolved
    </Button>
  );
}
