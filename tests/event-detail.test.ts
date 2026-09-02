import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createRsvp, cancelRsvp } from "@/lib/rsvp/rsvp";
import { getEventDetail } from "@/lib/rsvp/event-detail";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";

describe("getEventDetail", () => {
  const adminPhone = "+15555550270";
  const memberPhone = "+15555550271";
  let adminId: string;
  let memberId: string;
  let eventId: string;
  let groupId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, displayName: "Admin", role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    const member = await prisma.user.create({
      data: { phone: memberPhone, displayName: "Member", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    memberId = member.id;
    groupId = (await createTestGroup(adminId, "Event Detail Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
    await addActiveMembership(groupId, memberId, "member");

    const event = await prisma.event.create({
      data: {
        groupId,
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
    await prisma.notification.deleteMany({ where: { eventId } });
    await prisma.rsvp.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { in: [adminPhone, memberPhone] } } });
  });

  it("splits RSVPs into going/waitlist and reports the viewer's own status", async () => {
    const detail = await getEventDetail(eventId, { id: memberId });
    expect(detail?.going).toHaveLength(1);
    expect(detail?.going[0].userId).toBe(adminId);
    expect(detail?.waitlist).toHaveLength(1);
    expect(detail?.waitlist[0].userId).toBe(memberId);
    expect(detail?.yourRsvp).toEqual({ status: "waitlist", queuePosition: 2 });
  });

  it("never includes phone numbers, for a member or an admin viewer", async () => {
    const memberView = await getEventDetail(eventId, { id: memberId });
    expect(memberView?.going[0]).not.toHaveProperty("phone");

    const adminView = await getEventDetail(eventId, { id: adminId });
    expect(adminView?.going[0]).not.toHaveProperty("phone");
  });

  it("returns null for a nonexistent event", async () => {
    const detail = await getEventDetail("nonexistent-id", { id: memberId });
    expect(detail).toBeNull();
  });

  it("a user who cancels and re-RSVPs disappears from Canceled, without deleting the old canceled row", async () => {
    await cancelRsvp(eventId, memberId);
    const afterCancel = await getEventDetail(eventId, { id: memberId });
    expect(afterCancel?.canceled.map((r) => r.userId)).toContain(memberId);
    expect(afterCancel?.going.concat(afterCancel.waitlist).some((r) => r.userId === memberId)).toBe(false);

    await createRsvp(eventId, memberId);
    const afterResignup = await getEventDetail(eventId, { id: memberId });
    // Present in the active lists again...
    expect(afterResignup?.going.concat(afterResignup.waitlist).some((r) => r.userId === memberId)).toBe(true);
    // ...and no longer shown in Canceled, even though the old canceled row
    // still exists in the DB (never deleted — just filtered from display).
    expect(afterResignup?.canceled.map((r) => r.userId)).not.toContain(memberId);

    const rawRows = await prisma.rsvp.findMany({ where: { eventId, userId: memberId } });
    expect(rawRows.filter((r) => r.status === "canceled")).toHaveLength(1);
    expect(rawRows.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("canceling and re-RSVPing multiple times shows exactly one Canceled entry, not one per cycle", async () => {
    // memberId is currently active from the previous test — run two more
    // full cancel/re-RSVP cycles, ending canceled (not re-signed-up).
    await cancelRsvp(eventId, memberId);
    await createRsvp(eventId, memberId);
    await cancelRsvp(eventId, memberId);
    await createRsvp(eventId, memberId);
    await cancelRsvp(eventId, memberId);

    const rawRows = await prisma.rsvp.findMany({ where: { eventId, userId: memberId } });
    expect(rawRows.filter((r) => r.status === "canceled").length).toBeGreaterThanOrEqual(3);

    const detail = await getEventDetail(eventId, { id: memberId });
    const memberCanceledEntries = detail?.canceled.filter((r) => r.userId === memberId) ?? [];
    expect(memberCanceledEntries).toHaveLength(1);
  });
});
