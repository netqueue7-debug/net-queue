"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventCommentItem } from "@/lib/comments/comments";
import { formatDateTime } from "@/lib/format-datetime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/inputs";
import { ErrorText } from "@/components/ui/text";
import { Linkify } from "@/components/ui/linkify";
import { TrashIcon } from "@/components/ui/icons";

export function EventComments({
  eventId,
  comments,
  viewerUserId,
  viewerRole,
}: {
  eventId: string;
  comments: EventCommentItem[];
  viewerUserId: string;
  viewerRole: "member" | "admin";
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePost() {
    if (!body.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to post comment.");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(commentId: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to delete comment.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Comments ({comments.length})</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const canDelete = c.authorId === viewerUserId || viewerRole === "admin";
            return (
              <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">
                    {c.authorDisplayName ?? "Member"} <span className="font-normal text-muted">{formatDateTime(c.createdAt)}</span>
                  </p>
                  <p className="whitespace-pre-wrap">
                    <Linkify text={c.body} />
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    disabled={loading}
                    aria-label="Delete comment"
                    className="shrink-0 text-muted hover:text-danger"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={viewerRole === "admin" ? "Post an update or answer a question…" : "Ask a question…"}
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="secondary" className="w-fit text-sm" onClick={handlePost} disabled={loading || !body.trim()}>
          Post
        </Button>
      </div>
    </section>
  );
}
