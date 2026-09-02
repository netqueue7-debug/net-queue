"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface BanPreviewItem {
  eventTitle: string;
  startsAt: string;
}

export function BanUnbanButton({ userId, banned }: { userId: string; banned: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BanPreviewItem[] | null>(null);

  async function handleUnban() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/unban`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to unban.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function openBanConfirmation() {
    setError(null);
    setLoading(true);
    try {
      const previewRes = await fetch(`/api/users/${userId}/ban-preview`);
      const previewBody = await previewRes.json().catch(() => ({}));
      setPreview(previewBody.rsvpsToCancel ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmBan() {
    setPreview(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/ban`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to ban.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const description =
    preview && preview.length > 0
      ? `This will cancel their upcoming RSVP(s) for: ${preview
          .map((r) => `${r.eventTitle} (${new Date(r.startsAt).toLocaleDateString()})`)
          .join(", ")}`
      : "They have no upcoming RSVPs to cancel.";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={banned ? "secondary" : "destructive-link"}
        className={banned ? "px-2.5 py-1 text-sm" : ""}
        disabled={loading}
        onClick={banned ? handleUnban : openBanConfirmation}
      >
        {banned ? "Unban" : "Ban"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}

      <ConfirmDialog
        open={preview !== null}
        title="Ban this user?"
        description={description}
        confirmLabel="Ban"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirmBan}
        onCancel={() => setPreview(null)}
      />
    </div>
  );
}
