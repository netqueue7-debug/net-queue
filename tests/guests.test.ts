import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { computeDerivedStatuses } from "@/lib/rsvp/seat-math";
import {
  addGuests,
  removeGuest,
  approveGuest,
  rejectGuest,
  adminAddGuests,
  listPendingGuestsForGroup,
} from "@/lib/guests/guests";
import { GuestCapExceededError } from "@/lib/guests/errors";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { GET as getWaiverRoute } from "@/app/api/waiver/[token]/route";
import { POST as signWaiverRoute } from "@/app/api/waiver/[token]/sign/route";

function req(url: string, opts: { method?: string; body?: unknown } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
  });
}

async function goingUserIds(eventId: string, capacity: number | null): Promise<Set<string>> {
  const active = await prisma.rsvp.findMany({ where: { eventId, status: "active" } });
  const guests = await prisma.guest.findMany({ where: { rsvpId: { in: active.map((r) => r.id) }, approvalStatus: "approved" } });
  const guestCountByRsvp = new Map<string, number>();
  for (const g of guests) guestCountByRsvp.set(g.rsvpId, (guestCountByRsvp.get(g.rsvpId) ?? 0) + 1);

  const statuses = computeDerivedStatuses(
    active.map((r) => ({ id: r.id, queuePosition: r.queuePosition, seats: 1 + (guestCountByRsvp.get(r.id) ?? 0) })),
    capacity,
  );
  return new Set(active.filter((r) => statuses.get(r.id) === "going").map((r) => r.userId));
}

describe("guests", () => {
  const adminPhone = "+15555550800";
  let adminId: string;
  let groupId: string;

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: { phone: adminPhone, role: "admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    adminId = admin.id;
    groupId = (await createTestGroup(adminId, "Guests Test Group")).id;
    await addActiveMembership(groupId, adminId, "admin");
  });

  afterAll(async () => {
    const events = await prisma.event.findMany({ where: { groupId }, select: { id: true } });
    const eventIds = events.map((e) => e.id);
    const rsvps = await prisma.rsvp.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
    const rsvpIds = rsvps.map((r) => r.id);
    const guests = await prisma.guest.findMany({ where: { rsvpId: { in: rsvpIds } }, select: { id: true } });
    await prisma.waiverSignature.deleteMany({ where: { guestId: { in: guests.map((g) => g.id) } } });
    await prisma.guest.deleteMany({ where: { id: { in: guests.map((g) => g.id) } } });
    await prisma.eventLog.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.notification.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.rsvp.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { phone: { startsWith: "+15555550800" } } });
    await prisma.user.deleteMany({ where: { phone: { startsWith: "+15555550810" } } });
  });

  async function makeEvent(overrides: Record<string, unknown> = {}) {
    return prisma.event.create({
      data: {
        groupId,
        title: "Guests Test Night",
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

  // Auto-incrementing suffix — avoids any risk of two calls in this file
  // accidentally reusing the same phone (a real unique DB constraint across
  // the whole file's run, not just within one test).
  let memberCounter = 0;
  async function makeMember() {
    memberCounter += 1;
    const phone = `+15555550810${String(memberCounter).padStart(2, "0")}`;
    const user = await prisma.user.create({
      data: { phone, waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
    });
    await addActiveMembership(groupId, user.id);
    return user;
  }

  it("party-aware seat math: an approved guest occupies extra seats, and the queue never skips (policy.md#1)", async () => {
    const event = await makeEvent({ capacity: 3 });
    const host = await makeMember();
    const solo = await makeMember();

    await createRsvp(event.id, host.id); // 1 seat, position 1
    await createRsvp(event.id, solo.id); // 1 seat, position 2 — 2/3 used so far

    const [guest] = await addGuests(event.id, host.id, ["Guest A"]);
    await approveGuest(guest.id, adminId); // host's party grows to 2 seats -> 3/3 used, still fits exactly

    let going = await goingUserIds(event.id, 3);
    expect(going).toEqual(new Set([host.id, solo.id]));

    // Now a second guest pushes host's party to 3 seats, needing 4 total —
    // doesn't fit in capacity 3. Host's party (now 3) should NOT be
    // partially seated, and solo (already going) is unaffected since they
    // were already seated before this change — but a *new* party behind
    // must not skip ahead into the seat host's growth didn't take.
    const [guest2] = await addGuests(event.id, host.id, ["Guest B"]);
    const other = await makeMember();
    await createRsvp(event.id, other.id); // position 3, waitlisted (capacity already full at 3/3)

    await approveGuest(guest2.id, adminId); // host now needs 3 seats total; capacity 3 total already has solo(1)+host(1)=2 before this

    going = await goingUserIds(event.id, 3);
    // host(3 seats) + solo(1 seat) = 4 > capacity 3, so host's party no
    // longer fits and waitlists entirely; "other" must NOT skip ahead
    // either, even though as a solo party of 1 they'd technically fit in
    // the seat host vacated.
    expect(going.has(other.id)).toBe(false);
  });

  it("member: add guests respects max_guests_per_rsvp, counting pending + approved", async () => {
    const event = await makeEvent({ capacity: 10, maxGuestsPerRsvp: 2 });
    const host = await makeMember();
    await createRsvp(event.id, host.id);

    const guests = await addGuests(event.id, host.id, ["A", "B"]);
    expect(guests).toHaveLength(2);

    await expect(addGuests(event.id, host.id, ["C"])).rejects.toBeInstanceOf(GuestCapExceededError);

    await approveGuest(guests[0].id, adminId);
    await approveGuest(guests[1].id, adminId);

    // Still refused after approval — the cap counts pending + approved, not just pending.
    await expect(addGuests(event.id, host.id, ["D"])).rejects.toBeInstanceOf(GuestCapExceededError);
  });

  it("member: removing an approved guest from a full event promotes the next waitlisted party", async () => {
    const event = await makeEvent({ capacity: 2 });
    const host = await makeMember();
    const waiting = await makeMember();

    await createRsvp(event.id, host.id); // 1 seat
    const [guest] = await addGuests(event.id, host.id, ["Plus One"]);
    await approveGuest(guest.id, adminId); // host's party now 2 seats -> capacity full

    await createRsvp(event.id, waiting.id); // waitlisted — no room

    let going = await goingUserIds(event.id, 2);
    expect(going).toEqual(new Set([host.id]));

    await removeGuest(guest.id, host.id); // frees 1 seat

    going = await goingUserIds(event.id, 2);
    expect(going).toEqual(new Set([host.id, waiting.id])); // promoted
  });

  it("admin: approving a guest for a host at the bottom of going demotes the party behind them, and notifies", async () => {
    const event = await makeEvent({ capacity: 2 });
    const host = await makeMember(); // position 1 — bottom of "going" once seated
    const behind = await makeMember(); // position 2

    await createRsvp(event.id, host.id);
    await createRsvp(event.id, behind.id); // capacity 2: both going (1 seat each)

    const [guest] = await addGuests(event.id, host.id, ["Plus One"]);

    await approveGuest(guest.id, adminId); // host now needs 2 seats -> total demand 3 > capacity 2

    const going = await goingUserIds(event.id, 2);
    expect(going.has(behind.id)).toBe(false); // demoted — assert it, per the task's own instruction

    const notification = await prisma.notification.findFirst({
      where: { eventId: event.id, userId: behind.id, type: "rsvp_demoted" },
    });
    expect(notification).not.toBeNull();
  });

  it("admin-added guests: created approved, exempt from the cap, and never change the host's queue_position", async () => {
    const event = await makeEvent({ capacity: 10, maxGuestsPerRsvp: 0 }); // cap of 0 — a member couldn't add any
    const host = await makeMember();
    const rsvp = await createRsvp(event.id, host.id);

    const guests = await adminAddGuests(event.id, host.id, ["Admin's Friend"], adminId);
    expect(guests).toHaveLength(1);
    expect(guests[0].approvalStatus).toBe("approved");
    expect(guests[0].addedByRole).toBe("admin");

    const rsvpAfter = await prisma.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
    expect(rsvpAfter.queuePosition).toBe(rsvp.queuePosition); // untouched
  });

  it("re-approval on additions: approving 2 then adding 2 more leaves exactly 2 pending, 2 approved", async () => {
    const event = await makeEvent({ capacity: 10 });
    const host = await makeMember(); // reuse suffix space is fine, phones differ by full string below
    await createRsvp(event.id, host.id);

    const batch1 = await addGuests(event.id, host.id, ["A", "B"]);
    await approveGuest(batch1[0].id, adminId);
    await approveGuest(batch1[1].id, adminId);

    const batch2 = await addGuests(event.id, host.id, ["C", "D"]);

    const rsvp = await prisma.rsvp.findFirstOrThrow({ where: { eventId: event.id, userId: host.id } });
    const allGuests = await prisma.guest.findMany({ where: { rsvpId: rsvp.id } });
    const approved = allGuests.filter((g) => g.approvalStatus === "approved");
    const pending = allGuests.filter((g) => g.approvalStatus === "pending");

    expect(approved.map((g) => g.id).sort()).toEqual(batch1.map((g) => g.id).sort());
    expect(pending.map((g) => g.id).sort()).toEqual(batch2.map((g) => g.id).sort());
  });

  it("admin approval queue: lists pending guests across the group's upcoming events", async () => {
    const event = await makeEvent({ capacity: 10 });
    const host = await makeMember(); // reused suffix ok, phone differs
    await createRsvp(event.id, host.id);
    const [guest] = await addGuests(event.id, host.id, ["Queued Guest"]);

    const pending = await listPendingGuestsForGroup(groupId);
    expect(pending.some((g) => g.id === guest.id)).toBe(true);

    await approveGuest(guest.id, adminId);
    const pendingAfter = await listPendingGuestsForGroup(groupId);
    expect(pendingAfter.some((g) => g.id === guest.id)).toBe(false);
  });

  it("rejecting a guest never blocks or affects seating — it simply stays out", async () => {
    const event = await makeEvent({ capacity: 10 });
    const host = await makeMember();
    await createRsvp(event.id, host.id);
    const [guest] = await addGuests(event.id, host.id, ["Rejected Guest"]);

    const rejected = await rejectGuest(guest.id, adminId);
    expect(rejected.approvalStatus).toBe("rejected");

    const going = await goingUserIds(event.id, 10);
    expect(going.has(host.id)).toBe(true); // host still going, unaffected
  });

  it("guest waivers never block approval or attendance, and the signing link works without login", async () => {
    const event = await makeEvent({ capacity: 10 });
    const host = await makeMember();
    await createRsvp(event.id, host.id);
    const [guest] = await addGuests(event.id, host.id, [null]); // no name yet — filled in at signing

    const approved = await approveGuest(guest.id, adminId);
    expect(approved.approvalStatus).toBe("approved"); // approved despite no signature at all

    const getRes = await getWaiverRoute(req(`http://localhost/api/waiver/${guest.waiverToken}`), {
      params: Promise.resolve({ token: guest.waiverToken }),
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.eventTitle).toBe("Guests Test Night");
    expect(body.waiverSignedAt).toBeNull();

    const signRes = await signWaiverRoute(
      req(`http://localhost/api/waiver/${guest.waiverToken}/sign`, { method: "POST", body: { name: "Real Guest Name" } }),
      { params: Promise.resolve({ token: guest.waiverToken }) },
    );
    expect(signRes.status).toBe(200);

    const signedGuest = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(signedGuest.name).toBe("Real Guest Name");
    expect(signedGuest.waiverSignedAt).not.toBeNull();
  });

  it("an invalid waiver token 404s on both GET and sign", async () => {
    const getRes = await getWaiverRoute(req("http://localhost/api/waiver/not-a-real-token"), {
      params: Promise.resolve({ token: "not-a-real-token" }),
    });
    expect(getRes.status).toBe(404);

    const signRes = await signWaiverRoute(
      req("http://localhost/api/waiver/not-a-real-token/sign", { method: "POST", body: { name: "X" } }),
      { params: Promise.resolve({ token: "not-a-real-token" }) },
    );
    expect(signRes.status).toBe(404);
  });
});
