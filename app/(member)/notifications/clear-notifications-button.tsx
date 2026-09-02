"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ClearNotificationsButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetch("/api/notifications", { method: "DELETE" });
      setConfirming(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="destructive-link" className="text-sm" onClick={() => setConfirming(true)}>
        Clear all
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Clear all notifications?"
        description="This permanently deletes your notification history. This can't be undone."
        confirmLabel="Clear all"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
