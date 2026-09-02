import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

// Seeds fixtures for e2e/series-flow.spec.ts. Same session-injection
// pattern as the other e2e seed scripts — see
// scripts/e2e/seed-member-rsvp-flow.ts for the rationale.
async function main() {
  const { prisma } = await import("../../lib/db");
  const { createSession } = await import("../../lib/auth/session");
  const { WAIVER_VERSION } = await import("../../lib/waivers/content");

  const adminPhone = "+15555550700";
  const memberPhone = "+15555550701";

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: { phone: adminPhone, displayName: "E2E Series Admin", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
  });
  const member = await prisma.user.upsert({
    where: { phone: memberPhone },
    update: {},
    create: { phone: memberPhone, displayName: "E2E Series Member", waiverVersion: WAIVER_VERSION, waiverAcceptedAt: new Date() },
  });

  const group = await prisma.group.create({
    data: {
      name: "E2E Series Test Group",
      joinPolicy: "open",
      joinCode: randomBytes(8).toString("base64url"),
      createdBy: admin.id,
    },
  });
  await prisma.groupMembership.createMany({
    data: [
      { groupId: group.id, userId: admin.id, role: "admin", status: "active" },
      { groupId: group.id, userId: member.id, role: "member", status: "active" },
    ],
  });

  const adminSession = await createSession(admin.id);
  const memberSession = await createSession(member.id);

  console.log(
    JSON.stringify({
      adminToken: adminSession.token,
      adminExpiresAt: adminSession.expiresAt.toISOString(),
      memberToken: memberSession.token,
      memberExpiresAt: memberSession.expiresAt.toISOString(),
      groupId: group.id,
      phones: [adminPhone, memberPhone],
    }),
  );
  await prisma.$disconnect();
}

main();
