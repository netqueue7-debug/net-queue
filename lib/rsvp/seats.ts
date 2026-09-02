import type { Prisma } from "@/lib/generated/prisma/client";
import type { prisma as prismaClient } from "@/lib/db";

// Structurally satisfied by both the top-level `prisma` client and a
// `Prisma.TransactionClient` (withEventLock's `tx`) — same generated model
// delegate shape either way, so one function works inside and outside the lock.
type GuestReadableDb = Pick<typeof prismaClient, "guest"> | Pick<Prisma.TransactionClient, "guest">;

// seats(rsvp) = 1 + count(approved guests) — architecture.md#seat-math.
// Guests in any other status (pending, rejected, removed) hold no seat.
export async function getApprovedGuestCounts(db: GuestReadableDb, rsvpIds: string[]): Promise<Map<string, number>> {
  if (rsvpIds.length === 0) return new Map();

  const rows = await db.guest.groupBy({
    by: ["rsvpId"],
    where: { rsvpId: { in: rsvpIds }, approvalStatus: "approved" },
    _count: { _all: true },
  });

  return new Map(rows.map((r) => [r.rsvpId, r._count._all]));
}

export function seatsFor(rsvpId: string, approvedGuestCounts: Map<string, number>): number {
  return 1 + (approvedGuestCounts.get(rsvpId) ?? 0);
}
