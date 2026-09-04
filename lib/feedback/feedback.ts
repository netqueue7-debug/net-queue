import { prisma } from "@/lib/db";
import { FeedbackNotFoundError } from "./errors";
import type { Feedback, FeedbackType, FeedbackStatus } from "@/lib/generated/prisma/client";

// Dates pre-serialized to ISO strings — same convention as
// EventCommentItem (lib/comments/comments.ts): every date crosses the
// server/client component boundary as a string, never a raw Date.
export interface FeedbackItem {
  id: string;
  userId: string;
  authorDisplayName: string | null;
  type: FeedbackType;
  body: string;
  status: FeedbackStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export function createFeedback(userId: string, type: FeedbackType, body: string): Promise<Feedback> {
  return prisma.feedback.create({ data: { userId, type, body } });
}

// Not group-scoped (feedback is about the app itself, not a specific
// group — docs/architecture.md#groups--tenancy), so there's no membership
// filter here; callers must be platform admin, enforced at the route.
export async function listFeedback(): Promise<FeedbackItem[]> {
  const rows = await prisma.feedback.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // "open" sorts before "resolved" — enum declaration order
    include: { user: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    authorDisplayName: r.user.displayName,
    type: r.type,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

export async function resolveFeedback(feedbackId: string): Promise<Feedback> {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new FeedbackNotFoundError();

  return prisma.feedback.update({
    where: { id: feedbackId },
    data: { status: "resolved", resolvedAt: new Date() },
  });
}
