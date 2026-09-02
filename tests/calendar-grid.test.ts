import { describe, expect, it } from "vitest";
import { parseDateParam, dateKey, addDays, addMonths, startOfWeek, monthGridRange, monthGridWeeks, weekDays } from "@/lib/calendar/grid";

describe("calendar grid math", () => {
  it("parseDateParam parses a YYYY-MM-DD string as local midnight", () => {
    const d = parseDateParam("2026-09-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0-indexed
    expect(d.getDate()).toBe(8);
  });

  it("parseDateParam falls back to today for undefined/garbage input", () => {
    const today = new Date();
    const fallback = parseDateParam(undefined);
    expect(dateKey(fallback)).toBe(dateKey(today));

    const garbage = parseDateParam("not-a-date");
    expect(dateKey(garbage)).toBe(dateKey(today));
  });

  it("dateKey round-trips with parseDateParam", () => {
    expect(dateKey(parseDateParam("2026-01-05"))).toBe("2026-01-05");
    expect(dateKey(parseDateParam("2026-12-31"))).toBe("2026-12-31");
  });

  it("addDays crosses month/year boundaries correctly", () => {
    expect(dateKey(addDays(parseDateParam("2026-01-31"), 1))).toBe("2026-02-01");
    expect(dateKey(addDays(parseDateParam("2026-12-31"), 1))).toBe("2027-01-01");
    expect(dateKey(addDays(parseDateParam("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("addMonths always lands on the 1st and wraps year boundaries", () => {
    expect(dateKey(addMonths(parseDateParam("2026-01-15"), 1))).toBe("2026-02-01");
    expect(dateKey(addMonths(parseDateParam("2026-12-15"), 1))).toBe("2027-01-01");
    expect(dateKey(addMonths(parseDateParam("2026-01-15"), -1))).toBe("2025-12-01");
  });

  it("startOfWeek returns the Sunday on/before the given date", () => {
    // 2026-09-08 is a Tuesday
    expect(dateKey(startOfWeek(parseDateParam("2026-09-08")))).toBe("2026-09-06");
    // A Sunday maps to itself
    expect(dateKey(startOfWeek(parseDateParam("2026-09-06")))).toBe("2026-09-06");
  });

  it("weekDays returns 7 consecutive days starting Sunday", () => {
    const days = weekDays(parseDateParam("2026-09-08")).map(dateKey);
    expect(days).toEqual(["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]);
  });

  it("monthGridRange pads to full weeks on both ends", () => {
    // September 2026: Sep 1 is a Tuesday, Sep 30 is a Wednesday
    const { gridStart, gridEnd } = monthGridRange(parseDateParam("2026-09-15"));
    expect(dateKey(gridStart)).toBe("2026-08-30"); // Sunday before Sep 1
    expect(dateKey(gridEnd)).toBe("2026-10-04"); // exclusive end, Sunday after the last grid week
  });

  it("monthGridWeeks produces full 7-day weeks covering the whole month", () => {
    const weeks = monthGridWeeks(parseDateParam("2026-09-15"));
    for (const week of weeks) expect(week).toHaveLength(7);

    const allDays = weeks.flat().map(dateKey);
    // Every real day of September 2026 must be present somewhere in the grid.
    for (let day = 1; day <= 30; day++) {
      const key = `2026-09-${String(day).padStart(2, "0")}`;
      expect(allDays).toContain(key);
    }
  });

  it("monthGridWeeks handles a month that spans 6 grid weeks (e.g. a month starting on Saturday)", () => {
    // August 2026 starts on a Saturday and has 31 days — a 6-week grid case.
    const weeks = monthGridWeeks(parseDateParam("2026-08-01"));
    expect(weeks.length).toBe(6);
  });
});
