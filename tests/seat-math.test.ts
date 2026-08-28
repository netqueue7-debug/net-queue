import { describe, expect, it } from "vitest";
import { computeDerivedStatuses, type SeatMathInput } from "@/lib/rsvp/seat-math";

function party(id: string, queuePosition: number, seats = 1): SeatMathInput {
  return { id, queuePosition, seats };
}

describe("computeDerivedStatuses", () => {
  it("capacity null: everyone goes, regardless of party size", () => {
    const rsvps = [party("a", 1, 50), party("b", 2, 1)];
    const result = computeDerivedStatuses(rsvps, null);
    expect(result.get("a")).toBe("going");
    expect(result.get("b")).toBe("going");
  });

  it("capacity 0: everyone waitlists (no party of size 0 exists)", () => {
    const rsvps = [party("a", 1), party("b", 2)];
    const result = computeDerivedStatuses(rsvps, 0);
    expect(result.get("a")).toBe("waitlist");
    expect(result.get("b")).toBe("waitlist");
  });

  it("empty active list returns an empty map (all-canceled case)", () => {
    const result = computeDerivedStatuses([], 10);
    expect(result.size).toBe(0);
  });

  it("exact fit: a party landing exactly on the capacity boundary goes, next waitlists", () => {
    const rsvps = [party("a", 1, 2), party("b", 2, 3), party("c", 3, 1)];
    const result = computeDerivedStatuses(rsvps, 5);
    expect(result.get("a")).toBe("going");
    expect(result.get("b")).toBe("going");
    expect(result.get("c")).toBe("waitlist");
  });

  it("no-skip rule: a party too big for remaining seats waitlists, and smaller parties behind it also waitlist", () => {
    // policy.md#1's exact example: capacity 10, 9 seats consumed, next party
    // of 2 can't fit the last seat, and the solo player behind them doesn't
    // skip ahead to take it either.
    const rsvps = [party("nine", 1, 9), party("two", 2, 2), party("solo", 3, 1)];
    const result = computeDerivedStatuses(rsvps, 10);
    expect(result.get("nine")).toBe("going");
    expect(result.get("two")).toBe("waitlist");
    expect(result.get("solo")).toBe("waitlist");
  });

  it("party larger than remaining seats waitlists even when it would fit total capacity", () => {
    const rsvps = [party("a", 1, 4), party("big", 2, 4), party("c", 3, 1)];
    // capacity 6: "a" takes 4 (2 remain), "big" needs 4 but only 2 remain -> waitlist,
    // "c" needs 1 and 2 remain, but no-skip means it still waitlists.
    const result = computeDerivedStatuses(rsvps, 6);
    expect(result.get("a")).toBe("going");
    expect(result.get("big")).toBe("waitlist");
    expect(result.get("c")).toBe("waitlist");
  });

  it("results are keyed by queue_position order, not input array order", () => {
    const rsvps = [party("second", 2, 1), party("first", 1, 1)];
    const result = computeDerivedStatuses(rsvps, 1);
    expect(result.get("first")).toBe("going");
    expect(result.get("second")).toBe("waitlist");
  });
});
