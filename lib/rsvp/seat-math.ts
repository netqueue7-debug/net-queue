export type DerivedStatus = "going" | "waitlist";

export interface SeatMathInput {
  id: string;
  queuePosition: number;
  // 1 + count(approved guests). Always 1 in Phase 1 — guests arrive in
  // Phase 2, at which point callers compute this from real guest rows
  // instead of this function changing.
  seats: number;
}

// Only pass *active* RSVPs — canceled ones aren't part of the queue at all
// (architecture.md#the-core-idea). capacity === null means uncapped: every
// active RSVP is "going". Otherwise, walk the queue in position order,
// accumulating seats; the first party that doesn't fit — and every party
// after it — waitlists. The walk never skips ahead to a smaller party that
// would fit (policy.md#1).
export function computeDerivedStatuses(
  activeRsvps: SeatMathInput[],
  capacity: number | null,
): Map<string, DerivedStatus> {
  const result = new Map<string, DerivedStatus>();

  if (capacity === null) {
    for (const rsvp of activeRsvps) result.set(rsvp.id, "going");
    return result;
  }

  const sorted = [...activeRsvps].sort((a, b) => a.queuePosition - b.queuePosition);

  let runningTotal = 0;
  let waitlisting = false;
  for (const rsvp of sorted) {
    if (!waitlisting && runningTotal + rsvp.seats <= capacity) {
      runningTotal += rsvp.seats;
      result.set(rsvp.id, "going");
    } else {
      waitlisting = true;
      result.set(rsvp.id, "waitlist");
    }
  }

  return result;
}
