import { describe, expect, it } from "vitest";
import { createEventSchema, updateEventSchema } from "@/lib/events/schema";
import { createSeriesSchema, updateSeriesSchema } from "@/lib/events/series-schema";
import { looksLikeAddress } from "@/lib/events/exact-location";
import { googleMapsSearchUrl, appleMapsSearchUrl } from "@/lib/maps-links";

const baseEventBody = {
  groupId: "group1",
  title: "Test Night",
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
  timezone: "America/New_York",
  signupOpensAt: new Date().toISOString(),
  locationRevealPolicy: "always" as const,
};

const baseSeriesBody = {
  groupId: "group1",
  title: "Test Series",
  weekdays: [2],
  startTime: "19:00",
  endTime: "21:00",
  timezone: "America/New_York",
  recurStartsAt: "2026-01-01",
  recurUntil: "2026-06-01",
  signupOpensRule: "immediately" as const,
  locationRevealPolicy: "always" as const,
};

describe("looksLikeAddress", () => {
  it("accepts a real-looking street address", () => {
    expect(looksLikeAddress("123 Main St, Springfield")).toBe(true);
    expect(looksLikeAddress("1 Infinite Loop")).toBe(true);
  });

  it("rejects blank or placeholder text with no street number", () => {
    expect(looksLikeAddress("")).toBe(false);
    expect(looksLikeAddress("   ")).toBe(false);
    expect(looksLikeAddress("TBD")).toBe(false);
    expect(looksLikeAddress("the gym")).toBe(false);
  });

  it("rejects text that's too short even if it starts with a digit", () => {
    expect(looksLikeAddress("1 A")).toBe(false);
  });
});

describe("exactLocation is required and address-shaped", () => {
  it("createEventSchema rejects a missing exactLocation", () => {
    const result = createEventSchema.safeParse(baseEventBody);
    expect(result.success).toBe(false);
  });

  it("createEventSchema rejects placeholder text that isn't address-shaped", () => {
    const result = createEventSchema.safeParse({ ...baseEventBody, exactLocation: "the gym" });
    expect(result.success).toBe(false);
  });

  it("createEventSchema accepts a real-looking street address", () => {
    const result = createEventSchema.safeParse({ ...baseEventBody, exactLocation: "123 Main St, Springfield" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exactLocation).toBe("123 Main St, Springfield");
  });

  it("updateEventSchema leaves exactLocation untouched (undefined) when omitted from the patch", () => {
    const result = updateEventSchema.safeParse({ title: "Renamed" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exactLocation).toBeUndefined();
  });

  it("updateEventSchema rejects a patch that sets exactLocation to non-address text", () => {
    const result = updateEventSchema.safeParse({ exactLocation: "somewhere" });
    expect(result.success).toBe(false);
  });

  it("createSeriesSchema rejects a missing exactLocation", () => {
    const result = createSeriesSchema.safeParse(baseSeriesBody);
    expect(result.success).toBe(false);
  });

  it("createSeriesSchema accepts a real-looking street address", () => {
    const result = createSeriesSchema.safeParse({ ...baseSeriesBody, exactLocation: "456 Oak Ave" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exactLocation).toBe("456 Oak Ave");
  });

  it("updateSeriesSchema rejects a patch that sets exactLocation to non-address text", () => {
    const result = updateSeriesSchema.safeParse({ exactLocation: "TBD" });
    expect(result.success).toBe(false);
  });
});

describe("maps search-link builders", () => {
  it("builds a Google Maps search URL with the address URL-encoded", () => {
    expect(googleMapsSearchUrl("123 Main St, Springfield")).toBe(
      "https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Springfield",
    );
  });

  it("builds an Apple Maps search URL with the address URL-encoded", () => {
    expect(appleMapsSearchUrl("123 Main St, Springfield")).toBe("https://maps.apple.com/?q=123%20Main%20St%2C%20Springfield");
  });
});
