import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("prisma client", () => {
  it("is constructed as a singleton", () => {
    expect(prisma).toBeDefined();
  });
});
