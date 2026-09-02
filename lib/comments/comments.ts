import { prisma } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications/notifications";
import { CommentNotFoundError } from "./errors";
import type { EventComment } from "@/lib/generated/prisma/client";

// `createdAt` is pre-serialized to an ISO string here (not left as `Date`)
// to match SerializedEvent's convention — every date crosses the server/
// client component boundary as a string, never a raw Date instance.
export interface EventCommentItem {
  id: string;
  authorId: string;
  authorDisplayName: string | null;
  body: string;
  createdAt: string;
}

export async function listComments(eventId: string): Promise<EventCommentItem[]> {
  const rows = await prisma.eventComment.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.author.displayName,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));
}

// An admin's comment notifies every other member with an active RSVP
// (in-app only — docs/phase-3-polish.md's SMS-cost discipline reserves SMS
// for rsvp_promoted/demoted/event_canceled). A member's question stays
// silent — asking a question shouldn't page the whole roster. The poster
// is excluded even if they hold their own RSVP.
export async function postComment(
  eventId: string,
  authorId: string,
  body: string,
  isGroupAdmin: boolean,
  eventTitle: string,
): Promise<EventComment> {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.eventComment.create({ data: { eventId, authorId, body } });

    if (isGroupAdmin) {
      const activeRsvps = await tx.rsvp.findMany({
        where: { eventId, status: "active", userId: { not: authorId } },
        select: { userId: true },
      });
      for (const rsvp of activeRsvps) {
        await enqueueNotification(tx, {
          userId: rsvp.userId,
          eventId,
          type: "event_comment_posted",
          payload: { eventTitle, commentBody: body },
        });
      }
    }

    return comment;
  });
}

// Includes the owning event's groupId so a route can decide "author or
// group admin" without a second query.
export async function getCommentWithGroupOrThrow(commentId: string) {
  const comment = await prisma.eventComment.findUnique({
    where: { id: commentId },
    include: { event: { select: { groupId: true } } },
  });
  if (!comment) throw new CommentNotFoundError();
  return comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  await prisma.eventComment.delete({ where: { id: commentId } });
}
