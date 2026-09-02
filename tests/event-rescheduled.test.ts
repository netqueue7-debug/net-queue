import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp, cancelRsvp } from "@/lib/rsvp/rsvp";
import { updateEvent } from "@/lib/events/events";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("event reschedule/relocation notifications", () => {
  const adminPhone = "+15555551600";
  const goingPhone = "+15555551601";
  const waitlistPhone = "+15555551602";
  const canceledPhone = "+15555551603";
  const allPhones = [adminPhone, goingPhone, waitlistPhone, canceledPhone];

  let adminId: string;
  let goingId: string;
  let waitlistId: string;
  let canceledId: string;
  let groupId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const going = await prisma.user.create({
      data: { phone: goingPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const waitlist = await prisma.user.create({
      data: { phone: waitlistPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const canceled = await prisma.user.create({
      data: { phone: canceledPhone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    goingId = going.id;
    waitlistId = waitlist.id;
    canceledId = canceled.id;

    groupId = (await createTestGroup(adminId, "Reschedule Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, goingId);
    await addActiveMembership(groupId, waitlistId);
    await addActiveMembership(groupId, canceledId);

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Reschedule Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        generalLocation: "Original Gym",
        capacity: 1, // going gets the one seat, waitlist waits
        createdBy: adminId,
      },
    });
    eventId = event.id;

    await createRsvp(eventId, goingId);
    await createRsvp(eventId, waitlistId);
    await createRsvp(eventId, canceledId);
    await cancelRsvp(eventId, canceledId);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: allPhones } } });
  });

  it("editing a field that isn't time/location logs and notifies nothing", async () => {
    await updateEvent(eventId, { title: "Reschedule Test Night (renamed)" }, adminId);

    expect(await prisma.eventLog.count({ where: { eventId, action: "event.rescheduled" } })).toBe(0);
    expect(await prisma.notification.count({ where: { eventId, type: "event_updated" } })).toBe(0);
  });

  it("changing the start/end time logs event.rescheduled and SMS-notifies every active RSVP holder, going and waitlist, but not a canceled one", async () => {
    const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const newStart = new Date(before.startsAt.getTime() + 30 * 60 * 1000);
    const newEnd = new Date(before.endsAt.getTime() + 30 * 60 * 1000);

    await updateEvent(eventId, { startsAt: newStart, endsAt: newEnd }, adminId);

    const log = await prisma.eventLog.findFirst({ where: { eventId, action: "event.rescheduled" }, orderBy: { createdAt: "desc" } });
    expect(log).not.toBeNull();
    expect(log!.payload).toMatchObject({ timeChanged: true, locationChanged: false });

    const notified = await prisma.notification.findMany({ where: { eventId, type: "event_updated" }, select: { userId: true } });
    const notifiedIds = new Set(notified.map((n) => n.userId));
    expect(notifiedIds).toEqual(new Set([goingId, waitlistId]));
    expect(notifiedIds.has(canceledId)).toBe(false);
  });

  it("changing only the location logs locationChanged without timeChanged", async () => {
    const notificationsBefore = await prisma.notification.count({ where: { eventId, type: "event_updated" } });

    await updateEvent(eventId, { generalLocation: "New Gym" }, adminId);

    const log = await prisma.eventLog.findFirst({ where: { eventId, action: "event.rescheduled" }, orderBy: { createdAt: "desc" } });
    expect(log!.payload).toMatchObject({ timeChanged: false, locationChanged: true });

    const notificationsAfter = await prisma.notification.count({ where: { eventId, type: "event_updated" } });
    expect(notificationsAfter).toBe(notificationsBefore + 2); // going + waitlist again
  });

  it("a capacity change in the same call still fires both capacity_changed and event_updated independently", async () => {
    const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const newStart = new Date(before.startsAt.getTime() + 15 * 60 * 1000);

    await updateEvent(eventId, { capacity: 5, startsAt: newStart }, adminId);

    expect(await prisma.notification.count({ where: { eventId, type: "capacity_changed" } })).toBeGreaterThan(0);
    const rescheduleLogs = await prisma.eventLog.count({ where: { eventId, action: "event.rescheduled" } });
    expect(rescheduleLogs).toBeGreaterThan(0);
  });
});
