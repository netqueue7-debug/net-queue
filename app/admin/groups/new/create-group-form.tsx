"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";

// Manual entry for now — docs/phase-0b-groups.md's group-creation task.
// The intended future flow is a public "request a group" form that feeds
// these same fields, reviewed and finished here by a platform admin; that
// public form doesn't exist yet, so everything is typed in by hand.
export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "approval">("open");
  const [adminPhone, setAdminPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, joinPolicy, adminPhone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to create group.");
        return;
      }
      router.push(`/admin/groups/${body.group.id}/events`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Group name" htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      <Field label="Join policy" htmlFor="joinPolicy">
        <Select id="joinPolicy" value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value as "open" | "approval")}>
          <option value="open">Open — join code activates immediately</option>
          <option value="approval">Approval required — join code queues a request</option>
        </Select>
      </Field>

      <Field
        label="Group admin's phone number"
        htmlFor="adminPhone"
        helper="Installed directly as this group's admin — no join code or approval step for them."
      >
        <Input
          id="adminPhone"
          type="tel"
          value={adminPhone}
          onChange={(e) => setAdminPhone(e.target.value)}
          placeholder="(555) 555-0100"
          required
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" loading={loading}>
        Create group
      </Button>
    </form>
  );
}
