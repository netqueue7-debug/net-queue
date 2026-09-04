import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createSession } = await import("../../lib/auth/session");

  const adminPhone = "+15555550900";
  const memberPhone = "+15555550901";

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: { phone: adminPhone, displayName: "E2E Guest Admin" },
  });
  const member = await prisma.user.upsert({
    where: { phone: memberPhone },
    update: {},
    create: { phone: memberPhone, displayName: "E2E Guest Member" },
  });

  const group = await prisma.group.create({
    data: {
      name: "E2E Guest Test Group",
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

  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: "E2E Guest Night",
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      timezone: "America/New_York",
      signupOpensAt: new Date(Date.now() - 1000),
      locationRevealPolicy: "always",
      capacity: 10,
      createdBy: admin.id,
    },
  });

  const adminSession = await createSession(admin.id);
  const memberSession = await createSession(member.id);

  console.log(
    JSON.stringify({
      adminToken: adminSession.token,
      adminExpiresAt: adminSession.expiresAt.toISOString(),
      memberToken: memberSession.token,
      memberExpiresAt: memberSession.expiresAt.toISOString(),
      eventId: event.id,
      phones: [adminPhone, memberPhone],
    }),
  );
  await prisma.$disconnect();
}

main();
