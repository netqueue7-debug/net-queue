import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { runLocationRevealJob, runDayBeforeReminderJob } from "@/lib/notifications/jobs";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("notification cron jobs", () => {
  const adminPhone = "+15555551100";
  const memberPhone = "+15555551101";
  let adminId: string;
  let memberId: string;
  let groupId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;
    groupId = (await createTestGroup(adminId, "Notification Jobs Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId, "member");
  });

  afterAll(async () => {
    const events = await prisma.event.findMany({ where: { groupId }, select: { id: true } });
    const eventIds = events.map((e) => e.id);
    await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.rsvp.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("location reveal: notifies the going list once the reveal moment passes, and never twice", async () => {
    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Reveal Job Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "hours_before",
        locationRevealHours: 2, // reveal is 1h before "now" relative to startsAt +1h -> already passed
        generalLocation: "Gym",
        exactLocation: "Court 3",
        capacity: 10,
        createdBy: adminId,
      },
    });
    await createRsvp(event.id, memberId);

    const firstRun = await runLocationRevealJob();
    expect(firstRun).toBeGreaterThanOrEqual(1);

    const notification = await prisma.notification.findFirst({
      where: { eventId: event.id, userId: memberId, type: "location_reveal" },
    });
    expect(notification).not.toBeNull();

    const secondRun = await runLocationRevealJob();
    expect(secondRun).toBe(0); // idempotent — nothing sent twice

    const allNotifications = await prisma.notification.findMany({
      where: { eventId: event.id, userId: memberId, type: "location_reveal" },
    });
    expect(allNotifications).toHaveLength(1);
  });

  it("location reveal: an 'always' policy event (nothing to reveal) is never notified", async () => {
    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Always Visible Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        generalLocation: "Gym",
        capacity: 10,
        createdBy: adminId,
      },
    });
    await createRsvp(event.id, memberId);

    await runLocationRevealJob();

    const notification = await prisma.notification.findFirst({ where: { eventId: event.id, type: "location_reveal" } });
    expect(notification).toBeNull();
  });

  it("day-before reminder: fires for an event starting tomorrow in its own timezone, for both going and waitlist, and only once", async () => {
    // "Tomorrow" computed in America/Los_Angeles specifically, to prove the
    // job isn't just using the server's or UTC's notion of "tomorrow."
    const timezone = "America/Los_Angeles";
    const tomorrowLocalNoon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Re-anchor to local noon in that timezone to avoid any boundary flakiness.
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(tomorrowLocalNoon);
    const startsAt = new Date(`${dateStr}T20:00:00Z`); // ~noon or early afternoon Pacific, comfortably mid-day

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Day Before Reminder Night",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        timezone,
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 1, // 1 going, 1 waitlisted
        createdBy: adminId,
      },
    });

    const other = await prisma.user.create({
      data: { phone: "+15555551102", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, other.id);

    await createRsvp(event.id, memberId); // going
    await createRsvp(event.id, other.id); // waitlisted

    const sent = await runDayBeforeReminderJob();
    expect(sent).toBeGreaterThanOrEqual(2);

    const memberNotified = await prisma.notification.findFirst({
      where: { eventId: event.id, userId: memberId, type: "day_before_reminder" },
    });
    const otherNotified = await prisma.notification.findFirst({
      where: { eventId: event.id, userId: other.id, type: "day_before_reminder" },
    });
    expect(memberNotified).not.toBeNull();
    expect(otherNotified).not.toBeNull(); // waitlisted too, not just going

    const secondRun = await runDayBeforeReminderJob();
    expect(secondRun).toBe(0);

    await prisma.notification.deleteMany({ where: { userId: other.id } });
    await prisma.rsvp.deleteMany({ where: { userId: other.id } });
    await prisma.groupMembership.deleteMany({ where: { userId: other.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });
});
