import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupMember } from "@/lib/groups/authz";
import { prisma } from "@/lib/db";
import { postCommentSchema } from "@/lib/comments/schema";
import { listComments, postComment } from "@/lib/comments/comments";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true } });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  try {
    await assertGroupMember(event.groupId, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const comments = await listComments(id);
  return NextResponse.json({ comments });
}

// Any active group member can post (not just an attendee) — this is a
// per-event Q&A/updates board, not gated on having RSVP'd.
export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const parsed = postCommentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true, title: true } });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  let membership;
  try {
    membership = await assertGroupMember(event.groupId, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const comment = await postComment(id, user.id, parsed.data.body, membership.role === "admin", event.title);
  return NextResponse.json({ comment }, { status: 201 });
}
