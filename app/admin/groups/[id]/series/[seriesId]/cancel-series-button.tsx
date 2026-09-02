"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorText } from "@/components/ui/text";

export function CancelSeriesButton({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/event-series/${seriesId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to cancel series.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive-link" disabled={loading} onClick={() => setConfirming(true)}>
        Cancel remaining series
      </Button>
      {error && <ErrorText>{error}</ErrorText>}

      <ConfirmDialog
        open={confirming}
        title="Cancel remaining series?"
        description="Every remaining instance of this series will be canceled. Past instances are left alone."
        confirmLabel="Cancel series"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
