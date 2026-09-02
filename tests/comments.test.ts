import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { GET as listCommentsRoute, POST as postCommentRoute } from "@/app/api/events/[id]/comments/route";
import { DELETE as deleteCommentRoute } from "@/app/api/events/[id]/comments/[commentId]/route";

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: {
      ...(opts.token ? { cookie: `session=${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  });
}

describe("event comments", () => {
  const adminPhone = "+15555551500";
  const memberPhone = "+15555551501";
  const otherMemberPhone = "+15555551502";
  const outsiderPhone = "+15555551503";
  const allPhones = [adminPhone, memberPhone, otherMemberPhone, outsiderPhone];

  let adminId: string;
  let adminToken: string;
  let memberId: string;
  let memberToken: string;
  let otherMemberId: string;
  let otherMemberToken: string;
  let outsiderToken: string;
  let groupId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const otherMember = await prisma.user.create({
      data: { phone: otherMemberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const outsider = await prisma.user.create({
      data: { phone: outsiderPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;
    otherMemberId = otherMember.id;
    adminToken = (await createSession(admin.id)).token;
    memberToken = (await createSession(member.id)).token;
    otherMemberToken = (await createSession(otherMember.id)).token;
    outsiderToken = (await createSession(outsider.id)).token;

    groupId = (await createTestGroup(adminId, "Comments Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId);
    await addActiveMembership(groupId, otherMemberId);

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Comments Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        createdBy: adminId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.eventComment.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: allPhones } } });
  });

  it("a member can post a comment without an RSVP, and it shows up in the list", async () => {
    const postRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, { method: "POST", body: { body: "What should I bring?" }, token: memberToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(postRes.status).toBe(201);

    const listRes = await listCommentsRoute(req(`http://localhost/api/events/${eventId}/comments`, { token: memberToken }), {
      params: Promise.resolve({ id: eventId }),
    });
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.comments.some((c: { body: string }) => c.body === "What should I bring?")).toBe(true);
  });

  it("someone outside the group can neither post nor list comments", async () => {
    const postRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, { method: "POST", body: { body: "Sneaky" }, token: outsiderToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(postRes.status).toBe(403);

    const listRes = await listCommentsRoute(req(`http://localhost/api/events/${eventId}/comments`, { token: outsiderToken }), {
      params: Promise.resolve({ id: eventId }),
    });
    expect(listRes.status).toBe(403);
  });

  it("an admin's comment notifies every other active RSVP holder in-app, but not itself or a member's comment", async () => {
    await createRsvp(eventId, memberId);
    await createRsvp(eventId, otherMemberId);
    await createRsvp(eventId, adminId);

    const adminPostRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, {
        method: "POST",
        body: { body: "Court's been moved to gym 2." },
        token: adminToken,
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(adminPostRes.status).toBe(201);

    const notifiedUserIds = (
      await prisma.notification.findMany({ where: { eventId, type: "event_comment_posted" }, select: { userId: true } })
    ).map((n) => n.userId);
    expect(new Set(notifiedUserIds)).toEqual(new Set([memberId, otherMemberId]));
    expect(notifiedUserIds).not.toContain(adminId); // poster excluded even though they hold an RSVP

    const countBefore = notifiedUserIds.length;
    const memberPostRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, {
        method: "POST",
        body: { body: "Sounds good, thanks!" },
        token: memberToken,
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(memberPostRes.status).toBe(201);

    const countAfter = await prisma.notification.count({ where: { eventId, type: "event_comment_posted" } });
    expect(countAfter).toBe(countBefore); // a member's comment stays silent
  });

  it("the author can delete their own comment", async () => {
    const postRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, { method: "POST", body: { body: "Delete me" }, token: memberToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    const { comment } = await postRes.json();

    const deleteRes = await deleteCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments/${comment.id}`, { method: "DELETE", token: memberToken }),
      { params: Promise.resolve({ id: eventId, commentId: comment.id }) },
    );
    expect(deleteRes.status).toBe(204);

    expect(await prisma.eventComment.findUnique({ where: { id: comment.id } })).toBeNull();
  });

  it("a group admin can delete another member's comment", async () => {
    const postRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, { method: "POST", body: { body: "Admin, delete this" }, token: memberToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    const { comment } = await postRes.json();

    const deleteRes = await deleteCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments/${comment.id}`, { method: "DELETE", token: adminToken }),
      { params: Promise.resolve({ id: eventId, commentId: comment.id }) },
    );
    expect(deleteRes.status).toBe(204);

    expect(await prisma.eventComment.findUnique({ where: { id: comment.id } })).toBeNull();
  });

  it("a non-author, non-admin member cannot delete someone else's comment", async () => {
    const postRes = await postCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments`, { method: "POST", body: { body: "Not yours" }, token: memberToken }),
      { params: Promise.resolve({ id: eventId }) },
    );
    const { comment } = await postRes.json();

    const deleteRes = await deleteCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments/${comment.id}`, { method: "DELETE", token: otherMemberToken }),
      { params: Promise.resolve({ id: eventId, commentId: comment.id }) },
    );
    expect(deleteRes.status).toBe(403);

    expect(await prisma.eventComment.findUnique({ where: { id: comment.id } })).not.toBeNull();
  });

  it("deleting a comment that doesn't exist 404s", async () => {
    const deleteRes = await deleteCommentRoute(
      req(`http://localhost/api/events/${eventId}/comments/not-a-real-id`, { method: "DELETE", token: memberToken }),
      { params: Promise.resolve({ id: eventId, commentId: "not-a-real-id" }) },
    );
    expect(deleteRes.status).toBe(404);
  });
});
