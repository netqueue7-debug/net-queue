"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

// Platform-admin-only control (this whole page is gated that way already —
// see app/admin/groups/page.tsx) for lib/groups/groups.ts#setGroupMemberLimit.
// A group admin has no equivalent control anywhere; they only ever see the
// resulting count/limit and a warning once it's reached
// (app/(member)/groups/[id]/about/invite-link-card.tsx).
export function MemberLimitEditor({
  groupId,
  activeMemberCount,
  initialLimit,
}: {
  groupId: string;
  activeMemberCount: number;
  initialLimit: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialLimit?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      const memberLimit = value.trim() ? Number(value) : null;
      const res = await fetch(`/api/groups/${groupId}/member-limit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberLimit }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to save.");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const atCapacity = initialLimit !== null && activeMemberCount >= initialLimit;

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className={atCapacity ? "font-medium text-warning" : "text-muted"}>
          {activeMemberCount}
          {initialLimit !== null ? `/${initialLimit}` : ""} members
        </span>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-accent hover:underline">
          Edit limit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Unlimited"
        className="w-24 py-1 text-sm"
      />
      <Button className="px-2 py-1 text-xs" onClick={handleSave} loading={loading}>
        Save
      </Button>
      <Button
        variant="secondary"
        className="px-2 py-1 text-xs"
        onClick={() => {
          setValue(initialLimit?.toString() ?? "");
          setEditing(false);
        }}
      >
        Cancel
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
