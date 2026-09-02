import { config } from "dotenv";
config({ path: ".env.local" });

// Cleans up by phone, not just the one eventId this run created — a
// previous run that got killed mid-test (e.g. by a Playwright timeout)
// can leave orphaned events behind, since try/finally doesn't reliably
// run when the whole test process is torn down externally.
async function main() {
  const [, , memberPhone, adminPhone] = process.argv;
  const { prisma } = await import("../../lib/db");

  const users = await prisma.user.findMany({ where: { phone: { in: [memberPhone, adminPhone] } } });
  const userIds = users.map((u) => u.id);

  await prisma.eventLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rsvp.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.event.deleteMany({ where: { createdBy: { in: userIds } } });
  // Groups created by this run's admin must go before the admin user
  // itself — `groups.created_by` is a RESTRICT foreign key. Memberships
  // must go before the group for the same reason.
  const groupIds = (await prisma.group.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } })).map(
    (g) => g.id,
  );
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.$disconnect();
}

main();
