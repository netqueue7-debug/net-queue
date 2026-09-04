import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../../lib/db");
  const { createSession } = await import("../../lib/auth/session");

  const memberPhone = "+15555550400";
  const adminPhone = "+15555550401";

  const member = await prisma.user.upsert({
    where: { phone: memberPhone },
    update: {},
    create: {
      phone: memberPhone,
      displayName: "E2E Member",
      role: "member",
    },
  });
  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: { phone: adminPhone, displayName: "E2E Admin", role: "admin" },
  });

  const groupName = "E2E Test Group";
  const group =
    (await prisma.group.findFirst({ where: { name: groupName } })) ??
    (await prisma.group.create({
      data: { name: groupName, joinPolicy: "open", joinCode: `e2e-${Date.now()}`, createdBy: admin.id },
    }));

  await prisma.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId: member.id } },
    update: { status: "active" },
    create: { groupId: group.id, userId: member.id, role: "member", status: "active" },
  });
  await prisma.groupMembership.upsert({
    where: { groupId_userId: { groupId: group.id, userId: admin.id } },
    update: { status: "active", role: "admin" },
    create: { groupId: group.id, userId: admin.id, role: "admin", status: "active" },
  });

  const { token, expiresAt } = await createSession(member.id);

  const event = await prisma.event.create({
    data: {
      groupId: group.id,
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
