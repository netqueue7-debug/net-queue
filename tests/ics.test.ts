import { describe, expect, it } from "vitest";
import { buildIcsEvent } from "@/lib/calendar/ics";

describe("buildIcsEvent", () => {
  const base = {
    uid: "event123",
    startsAt: new Date("2026-09-08T22:00:00.000Z"),
    endsAt: new Date("2026-09-08T23:00:00.000Z"),
    title: "Tuesday Volleyball",
  };

  it("produces a well-formed single-VEVENT calendar with CRLF line endings", () => {
    const ics = buildIcsEvent(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("UID:event123@netqueue\r\n");
    expect(ics).toContain("DTSTART:20260908T220000Z\r\n");
    expect(ics).toContain("DTEND:20260908T230000Z\r\n");
    expect(ics).toContain("SUMMARY:Tuesday Volleyball\r\n");
  });

  it("omits DESCRIPTION/LOCATION when not provided", () => {
    const ics = buildIcsEvent(base);
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });

  it("includes DESCRIPTION and LOCATION when provided", () => {
    const ics = buildIcsEvent({ ...base, description: "Bring knee pads", location: "Main Gym, 123 Court St" });
    expect(ics).toContain("DESCRIPTION:Bring knee pads\r\n");
    expect(ics).toContain("LOCATION:Main Gym\\, 123 Court St\r\n");
  });

  it("escapes commas, semicolons, backslashes, and newlines in text fields", () => {
    const ics = buildIcsEvent({ ...base, title: 'Volleyball; Bring: a,b\\c\nline2' });
    expect(ics).toContain("SUMMARY:Volleyball\\; Bring: a\\,b\\\\c\\nline2\r\n");
  });

  it("folds lines longer than 75 characters with a leading-space continuation", () => {
    const longTitle = "A".repeat(120);
    const ics = buildIcsEvent({ ...base, title: longTitle });
    const summaryLineStart = ics.indexOf("SUMMARY:");
    const nextCrlf = ics.indexOf("\r\n", summaryLineStart);
    const firstPhysicalLine = ics.slice(summaryLineStart, nextCrlf);
    expect(firstPhysicalLine.length).toBeLessThanOrEqual(75);
    // The folded continuation begins with a single space.
    expect(ics.slice(nextCrlf, nextCrlf + 3)).toBe("\r\n ");
  });

  it("always produces a fresh DTSTAMP close to now", () => {
    const before = Date.now();
    const ics = buildIcsEvent(base);
    const match = /DTSTAMP:(\d{8}T\d{6}Z)/.exec(ics);
    expect(match).not.toBeNull();
    const stamp = match![1];
    const parsed = Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(stamp.slice(9, 11)),
      Number(stamp.slice(11, 13)),
      Number(stamp.slice(13, 15)),
    );
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
