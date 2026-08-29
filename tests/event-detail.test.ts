import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { getEventDetail } from "@/lib/rsvp/event-detail";
import { WAIVER_VERSION } from "@/lib/waivers/content";

describe("getEventDetail", () => {
  const adminPhone = "+15555550270";
  const memberPhone = "+15555550271";
  let adminId: string;
  let memberId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, displayName: "Admin", role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, displayName: "Member", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;

    const event = await prisma.event.create({
      data: {
        title: "Detail Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        exactLocation: "Court 7",
        capacity: 1,
        createdBy: adminId,
      },
    });
    eventId = event.id;

    await createRsvp(eventId, adminId); // going (capacity 1)
    await createRsvp(eventId, memberId); // waitlist
  });

  afterAll(async () => {
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("splits RSVPs into going/waitlist and reports the viewer's own status", async () => {
    const detail = await getEventDetail(eventId, { id: memberId, role: "member" });
    expect(detail?.going).toHaveLength(1);
    expect(detail?.going[0].userId).toBe(adminId);
    expect(detail?.waitlist).toHaveLength(1);
    expect(detail?.waitlist[0].userId).toBe(memberId);
    expect(detail?.yourRsvp).toEqual({ status: "waitlist", queuePosition: 2 });
  });

  it("does not include phone numbers for a member viewer", async () => {
    const detail = await getEventDetail(eventId, { id: memberId, role: "member" });
    expect(detail?.going[0].phone).toBeUndefined();
  });

  it("includes phone numbers for an admin viewer", async () => {
    const detail = await getEventDetail(eventId, { id: adminId, role: "admin" });
    expect(detail?.going[0].phone).toBe(adminPhone);
  });

  it("returns null for a nonexistent event", async () => {
    const detail = await getEventDetail("nonexistent-id", { id: memberId, role: "member" });
    expect(detail).toBeNull();
  });
});
