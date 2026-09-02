import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("events + rsvps schema", () => {
  const phone = "+15555550200";
  let userId: string;
  let eventId: string;
  let groupId: string;

  afterAll(async () => {
    await prisma.rsvp.deleteMany({ where: { userId } });
    await prisma.event.deleteMany({ where: { createdBy: userId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("sets up an admin and an event to RSVP against", async () => {
    const admin = await prisma.user.create({ data: { phone, displayName: "Admin", role: "admin" } });
    userId = admin.id;
    groupId = (await createTestGroup(userId, "Events RSVPs Schema Test Group")).id;

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(),
        locationRevealPolicy: "always",
        createdBy: admin.id,
      },
    });
    eventId = event.id;
    expect(event.status).toBe("scheduled");
  });

  it("rejects a double active RSVP at the DB level", async () => {
    await prisma.rsvp.create({ data: { eventId, userId, queuePosition: 1, status: "active" } });

    await expect(
      prisma.rsvp.create({ data: { eventId, userId, queuePosition: 2, status: "active" } }),
    ).rejects.toThrow();
  });

  it("allows a new row for the same (event, user) once the prior one is canceled", async () => {
    await prisma.rsvp.updateMany({ where: { eventId, userId }, data: { status: "canceled", canceledAt: new Date() } });

    const resignup = await prisma.rsvp.create({ data: { eventId, userId, queuePosition: 3, status: "active" } });
    expect(resignup.status).toBe("active");

    const rows = await prisma.rsvp.findMany({ where: { eventId, userId } });
    expect(rows).toHaveLength(2);
  });
});
