import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { updateEvent } from "@/lib/events/events";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("capacity change semantics", () => {
  const phones = Array.from({ length: 5 }, (_, i) => `+1555555025${i}`);
  let adminId: string;
  let userIds: string[];
  let eventId: string;
  let groupId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      phones.map((phone, i) =>
        prisma.user.create({
          data: {
            phone,
            role: i === 0 ? "admin" : "member",
          },
        }),
      ),
    );
    adminId = users[0].id;
    userIds = users.map((u) => u.id);
    groupId = (await createTestGroup(adminId, "Capacity Change Test Group")).id;
    await Promise.all(userIds.map((userId, i) => addActiveMembership(groupId, userId, i === 0 ? "admin" : "member")));

    const event = await prisma.event.create({
      data: {
        groupId,
        title: "Capacity Change Test",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        capacity: 2,
        createdBy: adminId,
      },
    });
    eventId = event.id;

    for (const userId of userIds) {
      await createRsvp(eventId, userId);
    }
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  });

  async function goingUserIds(): Promise<Set<string>> {
    const active = await prisma.rsvp.findMany({ where: { eventId, status: "active" } });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const statuses = computeDerivedStatuses(
      active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 })),
      event.capacity,
    );
    const goingIds = active.filter((r) => statuses.get(r.id) === "going").map((r) => r.userId);
    return new Set(goingIds);
  }

  it("starts with exactly the first 2 (of 5) going at capacity 2", async () => {
    const going = await goingUserIds();
    expect(going).toEqual(new Set([userIds[0], userIds[1]]));
  });

  it("raising capacity to 4 promotes from the top of the waitlist: exactly positions 1-4 going", async () => {
    await updateEvent(eventId, { capacity: 4 });
    const going = await goingUserIds();
    expect(going).toEqual(new Set([userIds[0], userIds[1], userIds[2], userIds[3]]));
  });

  it("lowering capacity to 1 demotes from the bottom of going: exactly position 1 going", async () => {
    await updateEvent(eventId, { capacity: 1 });
    const going = await goingUserIds();
    expect(going).toEqual(new Set([userIds[0]]));
  });

  it("uncapping (capacity: null) promotes everyone", async () => {
    await updateEvent(eventId, { capacity: null });
    const going = await goingUserIds();
    expect(going).toEqual(new Set(userIds));
  });

  it("resubmitting the same capacity (the edit form always includes it) logs and notifies nothing", async () => {
    const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const logsBefore = await prisma.eventLog.count({ where: { eventId, action: "event.capacity_changed" } });
    const notificationsBefore = await prisma.notification.count({ where: { eventId, type: "capacity_changed" } });

    // Same edit-form behavior that triggered the bug: every save includes
    // `capacity` in the body even when the admin only changed another
    // field, so "capacity" in input is true on every edit.
    await updateEvent(eventId, { capacity: before.capacity, title: "Capacity Change Test (renamed)" }, adminId);

    const after = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(after.capacity).toBe(before.capacity);
    expect(after.title).toBe("Capacity Change Test (renamed)");

    const logsAfter = await prisma.eventLog.count({ where: { eventId, action: "event.capacity_changed" } });
    expect(logsAfter).toBe(logsBefore);

    const notificationsAfter = await prisma.notification.count({ where: { eventId, type: "capacity_changed" } });
    expect(notificationsAfter).toBe(notificationsBefore);
  });
});
