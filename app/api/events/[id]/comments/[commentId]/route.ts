import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { getCommentWithGroupOrThrow, deleteComment } from "@/lib/comments/comments";
import { CommentNotFoundError } from "@/lib/comments/errors";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

// Author-or-group-admin, same authority split as RSVP removal
// (policy.md#6) — a group admin's authority never crosses into a group
// they don't administer, so this still checks the comment's own event's
// group, not just "is this caller an admin of something."
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { commentId } = await params;
  try {
    const comment = await getCommentWithGroupOrThrow(commentId);
    if (comment.authorId !== user.id) {
      await assertGroupAdmin(comment.event.groupId, user.id);
    }
    await deleteComment(commentId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof CommentNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
