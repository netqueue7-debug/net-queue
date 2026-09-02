import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const phones = process.argv.slice(2);
  const { prisma } = await import("../../lib/db");

  const users = await prisma.user.findMany({ where: { phone: { in: phones } } });
  const userIds = users.map((u) => u.id);

  const groups = await prisma.group.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } });
  const groupIds = groups.map((g) => g.id);
  const seriesRows = await prisma.eventSeries.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } });
  const seriesIds = seriesRows.map((s) => s.id);

  await prisma.eventLog.deleteMany({ where: { event: { groupId: { in: groupIds } } } });
  await prisma.notification.deleteMany({ where: { OR: [{ event: { groupId: { in: groupIds } } }, { userId: { in: userIds } }] } });
  await prisma.rsvp.deleteMany({ where: { event: { groupId: { in: groupIds } } } });
  await prisma.event.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.eventSeries.deleteMany({ where: { id: { in: seriesIds } } });
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.$disconnect();
}

main();
