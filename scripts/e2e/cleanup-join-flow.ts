import { config } from "dotenv";
config({ path: ".env.local" });

// Cleans up by phone (not just IDs from one run) — same rationale as
// cleanup-member-rsvp-flow.ts: a killed test process can leave orphans
// behind, and phone-keyed cleanup stays correct regardless.
async function main() {
  const phones = process.argv.slice(2);
  const { prisma } = await import("../../lib/db");

  const users = await prisma.user.findMany({ where: { phone: { in: phones } } });
  const userIds = users.map((u) => u.id);

  const groups = await prisma.group.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } });
  const groupIds = groups.map((g) => g.id);

  await prisma.eventLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.rsvp.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.event.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.groupMembership.deleteMany({ where: { OR: [{ groupId: { in: groupIds } }, { userId: { in: userIds } }] } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.$disconnect();
}

main();
