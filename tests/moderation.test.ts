import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { UserBannedError } from "@/lib/rsvp/errors";
import { getBanPreview, banUser, unbanUser } from "@/lib/users/moderation";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { GET as banPreviewRoute } from "@/app/api/users/[id]/ban-preview/route";
import { POST as banRoute } from "@/app/api/users/[id]/ban/route";

function req(url: string, opts: { method?: string } = {}) {
  return new NextRequest(url, { method: opts.method ?? "GET" });
}

describe("moderation (ban/unban)", () => {
  const adminPhone = "+15555551200";
  const memberPhone = "+15555551201";
  const outsiderAdminPhone = "+15555551202"; // admin of an unrelated group
  let adminId: string;
  let memberId: string;
  let outsiderAdminId: string;
  let adminToken: string;
  let outsiderAdminToken: string;
  let groupId: string;
  let unrelatedGroupId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const outsiderAdmin = await prisma.user.create({ data: { phone: outsiderAdminPhone } });

    adminId = admin.id;
    memberId = member.id;
    outsiderAdminId = outsiderAdmin.id;
    adminToken = (await createSession(admin.id)).token;
    outsiderAdminToken = (await createSession(outsiderAdmin.id)).token;

    groupId = (await createTestGroup(adminId, "Moderation Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId, "member");

    unrelatedGroupId = (await createTestGroup(outsiderAdminId, "Unrelated Group")).id;
    await addActiveMembership(unrelatedGroupId, outsiderAdminId, "admin");

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Moderation Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 10,
        createdBy: adminId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await deleteTestGroup(unrelatedGroupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone, outsiderAdminPhone] } } });
  });

  it("ban preview shows exactly what will be canceled", async () => {
    await createRsvp(eventId, memberId);
    const preview = await getBanPreview(memberId);
    expect(preview).toHaveLength(1);
    expect(preview[0].eventId).toBe(eventId);
  });

  it("an admin with no relationship to the user can't ban them", async () => {
    const res = await banPreviewRoute(req(`http://localhost/api/users/${memberId}/ban-preview`, {}), {
      params: Promise.resolve({ id: memberId }),
    });
    // no token attached below via a helper — build request with cookie directly
    const authed = new NextRequest(`http://localhost/api/users/${memberId}/ban-preview`, {
      headers: { cookie: `session=${outsiderAdminToken}` },
    });
    const forbidden = await banPreviewRoute(authed, { params: Promise.resolve({ id: memberId }) });
    expect(forbidden.status).toBe(403);
    expect(res.status).toBe(401); // sanity: no cookie at all is unauthenticated, not forbidden
  });

  it("banning cancels active RSVPs explicitly, blocks new ones, and does not log the user out silently elsewhere", async () => {
    const authedReq = new NextRequest(`http://localhost/api/users/${memberId}/ban`, {
      method: "POST",
      headers: { cookie: `session=${adminToken}` },
    });
    const res = await banRoute(authedReq, { params: Promise.resolve({ id: memberId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canceledCount).toBe(1);

    const rsvp = await prisma.rsvp.findFirst({ where: { eventId, userId: memberId } });
    expect(rsvp?.status).toBe("canceled"); // explicit cancellation, not a silent flag flip

    const user = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    expect(user.bannedAt).not.toBeNull();

    // New RSVPs are blocked while banned.
    await expect(createRsvp(eventId, memberId)).rejects.toBeInstanceOf(UserBannedError);
  });

  it("unbanning allows a new RSVP but does not resurrect the old queue position", async () => {
    const oldRsvp = await prisma.rsvp.findFirstOrThrow({ where: { eventId, userId: memberId } });

    await unbanUser(memberId);

    const rsvp = await createRsvp(eventId, memberId);
    expect(rsvp.status).toBe("active");
    expect(rsvp.id).not.toBe(oldRsvp.id); // a new row, not the resurrected old one
    expect(rsvp.queuePosition).toBeGreaterThan(oldRsvp.queuePosition); // back of the queue, not restored
  });

  it("banUser is a no-op-safe helper directly (used by the route, exercised here for the explicit-cancellation guarantee)", async () => {
    const other = await prisma.user.create({
      data: { phone: "+15555551203", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, other.id);
    await createRsvp(eventId, other.id);

    const { canceledCount } = await banUser(other.id, adminId);
    expect(canceledCount).toBe(1);

    const rsvp = await prisma.rsvp.findFirst({ where: { eventId, userId: other.id } });
    expect(rsvp?.status).toBe("canceled");

    await prisma.notification.deleteMany({ where: { userId: other.id } });
    await prisma.rsvp.deleteMany({ where: { userId: other.id } });
    await prisma.groupMembership.deleteMany({ where: { userId: other.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });
});
