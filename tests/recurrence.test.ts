import { describe, expect, it } from "vitest";
import { generateOccurrenceDates, materializeOccurrence } from "@/lib/events/recurrence";

function localWallClock(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

function localDateString(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);
}

describe("generateOccurrenceDates", () => {
  it("produces the right count of instances for Tuesdays/Thursdays over a two-week window", () => {
    // 2026-01-01 is a Thursday, 2026-01-15 is a Thursday two weeks later.
    // Noon UTC, not midnight — midnight UTC is still the *previous* day in
    // America/New_York (UTC-5 in January), which would shift the window.
    const from = new Date("2026-01-01T12:00:00Z");
    const until = new Date("2026-01-15T12:00:00Z");
    const occurrences = generateOccurrenceDates([2, 4], "America/New_York", from, until);

    expect(occurrences).toEqual([
      { year: 2026, month: 1, day: 1 },
      { year: 2026, month: 1, day: 6 },
      { year: 2026, month: 1, day: 8 },
      { year: 2026, month: 1, day: 13 },
      { year: 2026, month: 1, day: 15 },
    ]);
  });

  it("includes both endpoints when they land on a matching weekday", () => {
    const from = new Date("2026-01-01T12:00:00Z"); // Thursday, noon UTC
    const until = new Date("2026-01-01T12:00:00Z");
    expect(generateOccurrenceDates([4], "America/New_York", from, until)).toEqual([{ year: 2026, month: 1, day: 1 }]);
    expect(generateOccurrenceDates([2], "America/New_York", from, until)).toEqual([]);
  });

  it("evaluates weekday membership in the series' own timezone, not the server's or UTC", () => {
    // 11pm Tuesday in Tokyo is already Wednesday in UTC/most US zones.
    const tuesdayLateInTokyo = new Date("2026-01-06T14:30:00Z"); // 2026-01-06 23:30 JST (Tue)
    const occurrences = generateOccurrenceDates([2], "Asia/Tokyo", tuesdayLateInTokyo, tuesdayLateInTokyo);
    expect(occurrences).toEqual([{ year: 2026, month: 1, day: 6 }]);
  });
});

describe("materializeOccurrence", () => {
  const series = {
    startTime: "19:00",
    endTime: "22:00",
    timezone: "America/New_York",
    signupOpensRule: "immediately" as const,
    signupOpensDaysBefore: null,
  };

  it("keeps 7:00pm local on both sides of the November DST change", () => {
    // 2026-11-01 is when US DST ends (falls back) — pick occurrences that
    // straddle it: one in EDT, one in EST.
    const beforeDst = materializeOccurrence(series, { year: 2026, month: 10, day: 27 }, new Date());
    const afterDst = materializeOccurrence(series, { year: 2026, month: 11, day: 3 }, new Date());

    expect(localWallClock(beforeDst.startsAt, "America/New_York")).toBe("19:00");
    expect(localWallClock(afterDst.startsAt, "America/New_York")).toBe("19:00");
    expect(localWallClock(beforeDst.endsAt, "America/New_York")).toBe("22:00");
    expect(localWallClock(afterDst.endsAt, "America/New_York")).toBe("22:00");

    // And the UTC offset genuinely differs — this isn't just two identical
    // instants; the underlying UTC hour actually shifted by the DST change.
    expect(beforeDst.startsAt.getUTCHours()).not.toBe(afterDst.startsAt.getUTCHours());
  });

  it("keeps the correct calendar date in the series timezone even when it differs from UTC's", () => {
    // 19:00 in a west-of-UTC zone lands on the *next* UTC calendar day.
    const occurrence = materializeOccurrence(
      { ...series, timezone: "America/Los_Angeles" },
      { year: 2026, month: 6, day: 15 },
      new Date(),
    );
    expect(localDateString(occurrence.startsAt, "America/Los_Angeles")).toBe("2026-06-15");
  });

  it("signupOpensRule: immediately uses the materialization timestamp", () => {
    const materializedAt = new Date("2026-06-01T12:00:00Z");
    const occurrence = materializeOccurrence(series, { year: 2026, month: 6, day: 15 }, materializedAt);
    expect(occurrence.signupOpensAt).toEqual(materializedAt);
  });

  it("signupOpensRule: days_before computes an offset from the instance's own start time", () => {
    const occurrence = materializeOccurrence(
      { ...series, signupOpensRule: "days_before", signupOpensDaysBefore: 2 },
      { year: 2026, month: 6, day: 15 },
      new Date(),
    );
    expect(occurrence.signupOpensAt.getTime()).toBe(occurrence.startsAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  });
});
