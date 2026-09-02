"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";
import { Linkify } from "@/components/ui/linkify";

export function EditDescriptionForm({ groupId, initialDescription }: { groupId: string; initialDescription: string }) {
  const router = useRouter();
  const [description, setDescription] = useState(initialDescription);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() || null }),
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

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <p className="whitespace-pre-wrap text-sm">
          {initialDescription ? <Linkify text={initialDescription} /> : "No description yet."}
        </p>
        <Button variant="secondary" className="w-fit px-2.5 py-1 text-sm" onClick={() => setEditing(true)}>
          Edit description
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        placeholder="What's this group about?"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button onClick={handleSave} loading={loading}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDescription(initialDescription);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
