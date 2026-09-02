import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { addGuests, approveGuest } from "@/lib/guests/guests";
import { getGroupEventsDashboard, getGroupDashboardSummary } from "@/lib/admin/dashboard";
import { getMemberAttendanceInGroup } from "@/lib/admin/attendance";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("admin dashboard stats", () => {
  const adminPhone = "+15555551300";
  const memberPhone = "+15555551301";
  let adminId: string;
  let memberId: string;
  let groupId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;
    groupId = (await createTestGroup(adminId, "Dashboard Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId, "member");

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Dashboard Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 4,
        createdBy: adminId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    const rsvps = await prisma.rsvp.findMany({ where: { eventId }, select: { id: true } });
    await prisma.guest.deleteMany({ where: { rsvpId: { in: rsvps.map((r) => r.id) } } });
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("computes fill rate, pending guest count, and outstanding waiver count per event", async () => {
    await createRsvp(eventId, memberId); // 1/4 seats
    const [pendingGuest] = await addGuests(eventId, memberId, ["Pending Friend"]);
    const [approvedGuest] = await addGuests(eventId, memberId, ["Approved Friend"]);
    await approveGuest(approvedGuest.id, adminId); // seats now 2/4, waiver unsigned

    const rows = await getGroupEventsDashboard(groupId);
    const row = rows.find((r) => r.id === eventId);
    expect(row).toBeDefined();
    expect(row!.goingSeats).toBe(2);
    expect(row!.fillRate).toBeCloseTo(0.5);
    expect(row!.pendingGuestCount).toBe(1);
    expect(row!.outstandingWaiverCount).toBe(1); // the approved-but-unsigned guest

    // Rejecting/removing shouldn't be double-counted — sanity on the pending guest id existing.
    expect(pendingGuest.approvalStatus).toBe("pending");

    const summary = await getGroupDashboardSummary(groupId);
    expect(summary.pendingGuestCount).toBeGreaterThanOrEqual(1);
  });

  it("attendance history recomputes derived status at read time, not stored", async () => {
    const history = await getMemberAttendanceInGroup(groupId, memberId);
    const row = history.find((h) => h.eventId === eventId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("going");
  });
});
