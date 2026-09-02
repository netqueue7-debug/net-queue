import { describe, expect, it } from "vitest";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import type { User } from "@/lib/generated/prisma/client";

function fakeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    phone: "+15555550199",
    displayName: "Sam",
    avatarUrl: null,
    role: "member",
    waiverAcceptedAt: new Date(),
    waiverVersion: WAIVER_VERSION,
    bannedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("waiver versioning", () => {
  it("does not re-prompt a user who accepted the current version", () => {
    expect(needsOnboarding(fakeUser({ waiverVersion: WAIVER_VERSION }))).toBe(false);
  });

  it("re-prompts a user whose accepted version predates a bump to WAIVER_VERSION", () => {
    // Simulates what happens the moment WAIVER_VERSION is bumped in source:
    // an already-accepted user's stored version is now stale.
    expect(needsOnboarding(fakeUser({ waiverVersion: WAIVER_VERSION - 1 }))).toBe(true);
  });

  it("re-prompts a user who has never accepted any version", () => {
    expect(needsOnboarding(fakeUser({ waiverVersion: null, waiverAcceptedAt: null }))).toBe(true);
  });
});
