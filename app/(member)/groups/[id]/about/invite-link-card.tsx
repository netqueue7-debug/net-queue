"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// `origin` is resolved server-side (from the request's own Host header,
// via next/headers in page.tsx) rather than read from `window.location` —
// a client component is still server-rendered for the initial HTML, so a
// browser-only origin would differ between that render and the client's
// first hydration pass and trip a hydration mismatch.
export function InviteLinkCard({
  groupId,
  origin,
  initialJoinCode,
  memberLimit,
  activeMemberCount,
}: {
  groupId: string;
  origin: string;
  initialJoinCode: string;
  memberLimit: number | null;
  activeMemberCount: number;
}) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [copied, setCopied] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const link = `${origin}/join/${joinCode}`;
  const atCapacity = memberLimit !== null && activeMemberCount >= memberLimit;

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/join-code/rotate`, { method: "POST" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to regenerate link.");
        return;
      }
      const body = await res.json();
      setJoinCode(body.joinCode);
      setConfirmingRegen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Share this link to let people join the group. A brand-new phone number is walked through sign-up and onboarding
        automatically before the join completes.
        {memberLimit !== null && ` Currently ${activeMemberCount}/${memberLimit} members.`}
      </p>
      {atCapacity && (
        <p className="text-sm text-warning">
          This group is at its member limit — new joins won&apos;t work until it&apos;s increased. Contact a platform
          admin to upgrade.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <code
          className={`flex-1 truncate rounded-md border px-2.5 py-1.5 text-sm ${atCapacity ? "border-warning/40 bg-warning/5" : "border-border bg-surface"}`}
        >
          {link}
        </code>
        <Button variant="secondary" className="text-sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <Button variant="secondary" className="w-fit text-sm" onClick={() => setConfirmingRegen(true)}>
        Regenerate link
      </Button>

      <ConfirmDialog
        open={confirmingRegen}
        title="Regenerate invite link?"
        description="The current link stops working immediately — anyone who has it saved (a pinned message, a saved bookmark) won't be able to use it anymore."
        confirmLabel="Regenerate"
        loading={loading}
        onConfirm={handleRegenerate}
        onCancel={() => setConfirmingRegen(false)}
      />
    </div>
  );
}
