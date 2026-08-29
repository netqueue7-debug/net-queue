import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createSession } = await import("../../lib/auth/session");
  const { WAIVER_VERSION } = await import("../../lib/waivers/content");

  const memberPhone = "+15555550400";
  const adminPhone = "+15555550401";

  const member = await prisma.user.upsert({
    where: { phone: memberPhone },
    update: {},
    create: {
      phone: memberPhone,
      displayName: "E2E Member",
      role: "member",
      waiverVersion: WAIVER_VERSION,
      waiverAcceptedAt: new Date(),
    },
  });
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: { phone: adminPhone, displayName: "E2E Admin", role: "admin" },
  });

  const { token, expiresAt } = await createSession(member.id);

  const event = await prisma.event.create({
    data: {
      title: "E2E Volleyball Night",
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      timezone: "America/New_York",
      signupOpensAt: new Date(Date.now() - 1000),
      locationRevealPolicy: "always",
      generalLocation: "Test Gym",
      capacity: 5,
      createdBy: admin.id,
    },
  });

  console.log(JSON.stringify({ token, expiresAt: expiresAt.toISOString(), eventId: event.id, memberPhone, adminPhone }));
  await prisma.$disconnect();
}

main();
