import { describe, expect, it } from "vitest";
import { createEventSchema, updateEventSchema } from "@/lib/events/schema";

const baseBody = {
  groupId: "group1",
  title: "Test Night",
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
  timezone: "America/New_York",
  signupOpensAt: new Date().toISOString(),
  locationRevealPolicy: "always" as const,
};

describe("event map link fields", () => {
  it("createEventSchema accepts valid http(s) URLs for both links", () => {
    const result = createEventSchema.safeParse({
      ...baseBody,
      googleMapsUrl: "https://maps.google.com/?q=1600+Amphitheatre+Pkwy",
      appleMapsUrl: "https://maps.apple.com/?q=1600+Amphitheatre+Pkwy",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleMapsUrl).toBe("https://maps.google.com/?q=1600+Amphitheatre+Pkwy");
      expect(result.data.appleMapsUrl).toBe("https://maps.apple.com/?q=1600+Amphitheatre+Pkwy");
    }
  });

  it("createEventSchema defaults both links to null when omitted", () => {
    const result = createEventSchema.safeParse(baseBody);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleMapsUrl).toBeNull();
      expect(result.data.appleMapsUrl).toBeNull();
    }
  });

  it("createEventSchema treats an empty string the same as omitted (null, not an error)", () => {
    const result = createEventSchema.safeParse({ ...baseBody, googleMapsUrl: "", appleMapsUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleMapsUrl).toBeNull();
      expect(result.data.appleMapsUrl).toBeNull();
    }
  });

  it("createEventSchema rejects a non-URL string", () => {
    const result = createEventSchema.safeParse({ ...baseBody, googleMapsUrl: "not a url" });
    expect(result.success).toBe(false);
  });

  it("updateEventSchema leaves map links untouched (undefined) when not included in the patch", () => {
    const result = updateEventSchema.safeParse({ title: "Renamed" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleMapsUrl).toBeUndefined();
      expect(result.data.appleMapsUrl).toBeUndefined();
    }
  });

  it("updateEventSchema clears a link to null when explicitly sent as an empty string", () => {
    const result = updateEventSchema.safeParse({ googleMapsUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.googleMapsUrl).toBeNull();
    }
  });
});
