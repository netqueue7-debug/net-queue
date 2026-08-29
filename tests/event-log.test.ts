import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp, cancelRsvp } from "@/lib/rsvp/rsvp";
import { updateEvent } from "@/lib/events/events";
import { WAIVER_VERSION } from "@/lib/waivers/content";

describe("event_log writes", () => {
  const phone = "+15555550260";
  let adminId: string;
  let eventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;

    const event = await prisma.event.create({
      data: {
        title: "Event Log Test",
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
    await prisma.eventLog.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("a signup -> cancel -> capacity change sequence produces three readable log rows", async () => {
    await createRsvp(eventId, adminId);
    await cancelRsvp(eventId, adminId);
    await updateEvent(eventId, { capacity: 5 }, adminId);

    const logs = await prisma.eventLog.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(3);

    expect(logs[0].action).toBe("rsvp.created");
    expect(logs[0].actorUserId).toBe(adminId);
    expect(logs[0].payload).toMatchObject({ queuePosition: 1 });

    expect(logs[1].action).toBe("rsvp.canceled");
    expect(logs[1].actorUserId).toBe(adminId);

    expect(logs[2].action).toBe("event.capacity_changed");
    expect(logs[2].actorUserId).toBe(adminId);
    expect(logs[2].payload).toMatchObject({ from: 10, to: 5 });
  });
});
