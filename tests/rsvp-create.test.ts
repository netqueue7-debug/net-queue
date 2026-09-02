import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import {
  AlreadyRsvpedError,
  EventCanceledError,
  UserBannedError,
  WaiverNotAcceptedError,
} from "@/lib/rsvp/errors";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("createRsvp", () => {
  const adminPhone = "+15555550230";
  let adminId: string;
  let groupId: string;
  let openEventId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    groupId = (await createTestGroup(adminId, "RSVP Create Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
  });

  afterAll(async () => {
    await prisma.rsvp.deleteMany({ where: { userId: adminId } });
    await prisma.event.deleteMany({ where: { createdBy: adminId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: adminPhone } });
  });

  async function makeOpenEvent(overrides: Record<string, unknown> = {}) {
    return prisma.event.create({
      data: {
        groupId,
        title: "RSVP Create Test Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        createdBy: adminId,
        ...overrides,
      },
    });
  }

  it("rejects RSVPing to a canceled event", async () => {
    const event = await makeOpenEvent({ status: "canceled" });
    await expect(createRsvp(event.id, adminId)).rejects.toBeInstanceOf(EventCanceledError);
  });

  it("rejects a banned user", async () => {
    const banned = await prisma.user.create({
      data: {
        phone: "+15555550231",
        role: "member",
        waiverVersion: WAIVER_VERSION,
        waiverAcceptedAt: new Date(),
        bannedAt: new Date(),
      },
    });
    await addActiveMembership(groupId, banned.id);
    const event = await makeOpenEvent();
    await expect(createRsvp(event.id, banned.id)).rejects.toBeInstanceOf(UserBannedError);
    await prisma.groupMembership.deleteMany({ where: { userId: banned.id } });
    await prisma.user.delete({ where: { id: banned.id } });
  });

  it("rejects a user who hasn't accepted the current waiver", async () => {
    const noWaiver = await prisma.user.create({ data: { phone: "+15555550232", role: "member" } });
    await addActiveMembership(groupId, noWaiver.id);
    const event = await makeOpenEvent();
    await expect(createRsvp(event.id, noWaiver.id)).rejects.toBeInstanceOf(WaiverNotAcceptedError);
    await prisma.groupMembership.deleteMany({ where: { userId: noWaiver.id } });
    await prisma.user.delete({ where: { id: noWaiver.id } });
  });

  it("assigns queue_position via MAX+1 and rejects a second active RSVP for the same user", async () => {
    const event = await makeOpenEvent();
    openEventId = event.id;

    const rsvp1 = await createRsvp(event.id, adminId);
    expect(rsvp1.queuePosition).toBe(1);
    expect(rsvp1.status).toBe("active");

    await expect(createRsvp(event.id, adminId)).rejects.toBeInstanceOf(AlreadyRsvpedError);
  });

  it("re-signing up after a cancellation creates a new row at the back of the queue", async () => {
    // Someone else signs up first so the queue has more than one position.
    const other = await prisma.user.create({
      data: { phone: "+15555550233", role: "member", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, other.id);
    await createRsvp(openEventId, other.id);

    await prisma.rsvp.updateMany({
      where: { eventId: openEventId, userId: adminId },
      data: { status: "canceled", canceledAt: new Date() },
    });

    const resignup = await createRsvp(openEventId, adminId);
    expect(resignup.queuePosition).toBe(3); // 1 (original, now canceled), 2 (other), 3 (this one)
    expect(resignup.status).toBe("active");

    const allRows = await prisma.rsvp.findMany({ where: { eventId: openEventId, userId: adminId } });
    expect(allRows).toHaveLength(2);

    await prisma.rsvp.deleteMany({ where: { userId: other.id } });
    await prisma.groupMembership.deleteMany({ where: { userId: other.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });
});
