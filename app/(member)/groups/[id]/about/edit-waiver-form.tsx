"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";
import { Linkify } from "@/components/ui/linkify";

export function EditWaiverForm({
  groupId,
  initialContent,
  initialVersion,
}: {
  groupId: string;
  initialContent: string;
  initialVersion: number | null;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
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
        body: JSON.stringify({ waiverContent: content.trim() || null }),
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
        {initialContent ? (
          <>
            <p className="whitespace-pre-wrap text-sm">
              <Linkify text={initialContent} />
            </p>
            <p className="text-xs text-muted">Version {initialVersion}</p>
          </>
        ) : (
          <p className="text-sm text-muted">
            No waiver configured — events can&apos;t require one until you add text here.
          </p>
        )}
        <Button variant="secondary" className="w-fit px-2.5 py-1 text-sm" onClick={() => setEditing(true)}>
          {initialContent ? "Edit waiver" : "Add waiver"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        placeholder="Waiver text members must accept before RSVPing to events that require it"
      />
      <p className="text-xs text-muted">
        Saving a change re-prompts every member to accept the new version. Clearing the text removes the waiver
        requirement entirely.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button onClick={handleSave} loading={loading}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setContent(initialContent);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
