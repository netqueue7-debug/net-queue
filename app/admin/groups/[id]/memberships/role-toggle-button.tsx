"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";

export function RoleToggleButton({ groupId, userId, role }: { groupId: string; userId: string; role: "member" | "admin" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRole = role === "admin" ? "member" : "admin";

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/memberships/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to update role.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" className="px-2.5 py-1 text-sm" disabled={loading} onClick={handleClick}>
        {role === "admin" ? "Demote to member" : "Promote to admin"}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
