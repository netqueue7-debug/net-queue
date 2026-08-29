import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { DELETE as removeRoute } from "@/app/api/admin/events/[id]/rsvp/route";

describe("admin RSVP removal", () => {
  const adminPhone = "+15555550280";
  const memberPhone = "+15555550281";
  const memberBPhone = "+15555550282";
  let adminId: string;
  let memberId: string;
  let memberBId: string;
  let adminToken: string;
  let memberToken: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const memberB = await prisma.user.create({
      data: { phone: memberBPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;
    memberBId = memberB.id;
    adminToken = (await createSession(admin.id)).token;
    memberToken = (await createSession(member.id)).token;

    const event = await prisma.event.create({
      data: {
        title: "Admin Remove Test",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 1,
        createdBy: adminId,
      },
    });
    eventId = event.id;

    await createRsvp(eventId, memberId); // going
    await createRsvp(eventId, memberBId); // waitlist
  });

  afterAll(async () => {
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone, memberBPhone] } } });
  });

  it("a member cannot remove another member's RSVP", async () => {
    const res = await removeRoute(
      new NextRequest(`http://localhost/api/admin/events/${eventId}/rsvp`, {
        method: "DELETE",
        headers: { cookie: `session=${memberToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberBId }),
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(res.status).toBe(403);
  });

  it("admin removal cancels the RSVP, promotes the waitlisted member, and logs the admin as actor", async () => {
    const res = await removeRoute(
      new NextRequest(`http://localhost/api/admin/events/${eventId}/rsvp`, {
        method: "DELETE",
        headers: { cookie: `session=${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId }),
      }),
      { params: Promise.resolve({ id: eventId }) },
    );
    expect(res.status).toBe(200);

    const removed = await prisma.rsvp.findFirst({ where: { eventId, userId: memberId } });
    expect(removed?.status).toBe("canceled");

    const active = await prisma.rsvp.findMany({ where: { eventId, status: "active" } });
    expect(active).toHaveLength(1);
    expect(active[0].userId).toBe(memberBId); // promoted

    const log = await prisma.eventLog.findFirst({ where: { eventId, action: "rsvp.canceled" } });
    expect(log?.actorUserId).toBe(adminId); // admin, not the removed member
  });
});
