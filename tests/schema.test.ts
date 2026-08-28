import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("users schema", () => {
  const phone = "+15555550100";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects a duplicate phone number at the database level", async () => {
    await prisma.user.create({ data: { phone, displayName: "First" } });

    await expect(
      prisma.user.create({ data: { phone, displayName: "Second" } }),
    ).rejects.toThrow();
  });
});
