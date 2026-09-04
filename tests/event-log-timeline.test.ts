import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp, cancelRsvp } from "@/lib/rsvp/rsvp";
import { updateEvent } from "@/lib/events/events";
import { addGuests, approveGuest, adminAddGuests } from "@/lib/guests/guests";
import { getEventLogTimeline } from "@/lib/admin/event-log";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("event log timeline", () => {
  const adminPhone = "+15555551400";
  const memberPhone = "+15555551401";
  let adminId: string;
  let memberId: string;
  let groupId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, displayName: "Admin", role: "admin" },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, displayName: "Member" },
    });
    adminId = admin.id;
    memberId = member.id;
    groupId = (await createTestGroup(adminId, "Event Log Timeline Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId, "member");

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Full Night Test",
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
    const rsvps = await prisma.rsvp.findMany({ where: { eventId }, select: { id: true } });
    await prisma.guest.deleteMany({ where: { rsvpId: { in: rsvps.map((r) => r.id) } } });
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("reads a full night's activity as a coherent, human-readable timeline in order", async () => {
    await createRsvp(eventId, memberId);
    await updateEvent(eventId, { capacity: 5 }, adminId);
    const [guest] = await addGuests(eventId, memberId, ["Friend"]);
    await approveGuest(guest.id, adminId);
    await adminAddGuests(eventId, memberId, ["Admin's Plus One"], adminId);
    await cancelRsvp(eventId, memberId, adminId);

    const timeline = await getEventLogTimeline(eventId);

    expect(timeline.map((t) => t.action)).toEqual([
      "rsvp.created",
      "event.capacity_changed",
      "guest.added",
      "guest.approved",
      "guest.admin_added",
      "rsvp.canceled",
    ]);

    // Every entry reads as a real sentence, not a raw payload dump.
    expect(timeline[0].description).toBe("Member signed up (position #1).");
    expect(timeline[1].description).toBe("Admin changed capacity from 10 to 5.");
    expect(timeline[2].description).toBe("Member added 1 guest (pending approval).");
    expect(timeline[3].description).toBe("Admin approved a guest.");
    expect(timeline[4].description).toBe("Admin added 1 guest directly (admin, pre-approved).");
    // Admin canceled *someone else's* RSVP — must name the actual owner, not just "canceled their RSVP."
    expect(timeline[5].description).toBe("Admin removed Member's RSVP.");

    // Strictly chronological.
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].createdAt.getTime()).toBeGreaterThanOrEqual(timeline[i - 1].createdAt.getTime());
    }
  });
});
