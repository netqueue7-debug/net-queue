import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { withEventLock } from "@/lib/rsvp/with-event-lock";
import { RsvpNotFoundError } from "@/lib/rsvp/errors";
import { GuestCapExceededError, GuestNotFoundError } from "./errors";
import { enqueueNotification } from "@/lib/notifications/notifications";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import type { Guest } from "@/lib/generated/prisma/client";

// Same entropy bar as a group join code (architecture.md) — this token is
// the only credential needed to reach a guest's waiver page, no login.
function generateWaiverToken(): string {
  return randomBytes(32).toString("base64url");
}

// Member-initiated add. Runs inside withEventLock purely for the atomic
// cap check (two concurrent adds racing past `max_guests_per_rsvp`) —
// pending guests hold no seat (policy.md#2), so this never changes the
// going/waitlist boundary and produces no promotion notifications.
export function addGuests(eventId: string, hostUserId: string, names: (string | null)[]): Promise<Guest[]> {
  return withEventLock(eventId, async (tx, event) => {
    const rsvp = await tx.rsvp.findFirst({ where: { eventId, userId: hostUserId, status: "active" } });
    if (!rsvp) throw new RsvpNotFoundError();

    if (event.maxGuestsPerRsvp !== null) {
      // pending + approved count against the cap (policy.md#3) — otherwise
      // a user could stack pending requests to sneak past it once approved.
      const existingCount = await tx.guest.count({
        where: { rsvpId: rsvp.id, approvalStatus: { in: ["pending", "approved"] } },
      });
      if (existingCount + names.length > event.maxGuestsPerRsvp) {
        throw new GuestCapExceededError(event.maxGuestsPerRsvp, existingCount);
      }
    }

    const created: Guest[] = [];
    for (const name of names) {
      const guest = await tx.guest.create({
        data: { rsvpId: rsvp.id, name, addedByRole: "user", approvalStatus: "pending", waiverToken: generateWaiverToken() },
      });
      created.push(guest);
    }

    await tx.eventLog.create({
      data: {
        actorUserId: hostUserId,
        eventId,
        action: "guest.added",
        payload: { rsvpId: rsvp.id, guestIds: created.map((g) => g.id) },
      },
    });

    return created;
  });
}

// Host-initiated removal — no approval needed (policy.md's derived rules).
// Frees a seat immediately if the guest was approved; withEventLock
// recomputes the boundary and fires promotion notifications either way.
export async function removeGuest(guestId: string, actorUserId: string): Promise<Guest> {
  const existing = await prisma.guest.findUnique({ where: { id: guestId }, include: { rsvp: true } });
  if (!existing) throw new GuestNotFoundError();

  return withEventLock(existing.rsvp.eventId, async (tx) => {
    const guest = await tx.guest.update({ where: { id: guestId }, data: { approvalStatus: "removed" } });
    await tx.eventLog.create({
      data: {
        actorUserId,
        eventId: existing.rsvp.eventId,
        action: "guest.removed",
        payload: { guestId, rsvpId: existing.rsvpId },
      },
    });
    return guest;
  });
}

// Seats are claimed at the *host's existing queue position* the moment of
// approval, never before (policy.md#2) — withEventLock's boundary
// recompute and promotion/demotion notifications happen here.
export async function approveGuest(guestId: string, approverId: string): Promise<Guest> {
  const existing = await prisma.guest.findUnique({ where: { id: guestId }, include: { rsvp: true } });
  if (!existing) throw new GuestNotFoundError();

  return withEventLock(existing.rsvp.eventId, async (tx) => {
    const guest = await tx.guest.update({
      where: { id: guestId },
      data: { approvalStatus: "approved", approvedBy: approverId, approvedAt: new Date() },
    });
    await tx.eventLog.create({
      data: {
        actorUserId: approverId,
        eventId: existing.rsvp.eventId,
        action: "guest.approved",
        payload: { guestId, rsvpId: existing.rsvpId },
      },
    });
    await enqueueNotification(tx, {
      userId: existing.rsvp.userId,
      eventId: existing.rsvp.eventId,
      type: "guest_approved",
      payload: { guestId, guestName: guest.name },
    });
    return guest;
  });
}

// A rejected pending guest held no seat, so this never affects the
// boundary — still routed through withEventLock for a consistent
// transaction + event_log pattern with every other guest mutation.
export async function rejectGuest(guestId: string, approverId: string): Promise<Guest> {
  const existing = await prisma.guest.findUnique({ where: { id: guestId }, include: { rsvp: true } });
  if (!existing) throw new GuestNotFoundError();

  return withEventLock(existing.rsvp.eventId, async (tx) => {
    const guest = await tx.guest.update({
      where: { id: guestId },
      data: { approvalStatus: "rejected", approvedBy: approverId, approvedAt: new Date() },
    });
    await tx.eventLog.create({
      data: {
        actorUserId: approverId,
        eventId: existing.rsvp.eventId,
        action: "guest.rejected",
        payload: { guestId, rsvpId: existing.rsvpId },
      },
    });
    await enqueueNotification(tx, {
      userId: existing.rsvp.userId,
      eventId: existing.rsvp.eventId,
      type: "guest_rejected",
      payload: { guestId, guestName: guest.name },
    });
    return guest;
  });
}

// Admin-added guests skip approval entirely (policy.md#5) — created
// directly `approved`, exempt from `max_guests_per_rsvp`, attached to the
// host's *existing* queue position (no queue jumping: the host's own
// `queue_position` is never touched, only the seat math around it).
export function adminAddGuests(eventId: string, hostUserId: string, names: (string | null)[], adminId: string): Promise<Guest[]> {
  return withEventLock(eventId, async (tx) => {
    const rsvp = await tx.rsvp.findFirst({ where: { eventId, userId: hostUserId, status: "active" } });
    if (!rsvp) throw new RsvpNotFoundError();

    const created: Guest[] = [];
    for (const name of names) {
      const guest = await tx.guest.create({
        data: {
          rsvpId: rsvp.id,
          name,
          addedByRole: "admin",
          approvalStatus: "approved",
          approvedBy: adminId,
          approvedAt: new Date(),
          waiverToken: generateWaiverToken(),
        },
      });
      created.push(guest);
    }

    await tx.eventLog.create({
      data: {
        actorUserId: adminId,
        eventId,
        action: "guest.admin_added",
        payload: { rsvpId: rsvp.id, guestIds: created.map((g) => g.id) },
      },
    });

    return created;
  });
}

// The admin approval queue: every pending guest across a group's
// not-yet-canceled events, oldest request first (docs/phase-2-recurrence-guests.md).
export function listPendingGuestsForGroup(groupId: string) {
  return prisma.guest.findMany({
    where: { approvalStatus: "pending", rsvp: { event: { groupId, status: "scheduled" } } },
    include: {
      rsvp: {
        include: {
          user: { select: { id: true, displayName: true } },
          event: { select: { id: true, title: true, startsAt: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export interface GuestWaiverView {
  guestId: string;
  name: string | null;
  waiverSignedAt: Date | null;
  eventTitle: string;
}

export async function getGuestByWaiverToken(token: string): Promise<GuestWaiverView | null> {
  const guest = await prisma.guest.findUnique({
    where: { waiverToken: token },
    include: { rsvp: { include: { event: { select: { title: true } } } } },
  });
  if (!guest) return null;
  return { guestId: guest.id, name: guest.name, waiverSignedAt: guest.waiverSignedAt, eventTitle: guest.rsvp.event.title };
}

// Waivers never block anything (policy.md's derived rules) — signing has
// no bearing on approval/attendance, it's purely an evidentiary record, so
// this never touches the RSVP queue and needs no lock.
export async function signGuestWaiver(token: string, name: string, ip: string): Promise<void> {
  const guest = await prisma.guest.findUnique({ where: { waiverToken: token } });
  if (!guest) throw new GuestNotFoundError();

  const signedAt = new Date();
  await prisma.$transaction([
    prisma.guest.update({ where: { id: guest.id }, data: { name, waiverSignedAt: signedAt } }),
    prisma.waiverSignature.create({
      data: { waiverVersion: WAIVER_VERSION, signerType: "guest", guestId: guest.id, ip, signedAt },
    }),
  ]);
}
