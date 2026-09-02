import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const phones = process.argv.slice(2);
  const { prisma } = await import("../../lib/db");

  const users = await prisma.user.findMany({ where: { phone: { in: phones } } });
  const userIds = users.map((u) => u.id);

  const groups = await prisma.group.findMany({ where: { createdBy: { in: userIds } }, select: { id: true } });
  const groupIds = groups.map((g) => g.id);
  const events = await prisma.event.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } });
  const eventIds = events.map((e) => e.id);
  const rsvps = await prisma.rsvp.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
  const rsvpIds = rsvps.map((r) => r.id);
  const guests = await prisma.guest.findMany({ where: { rsvpId: { in: rsvpIds } }, select: { id: true } });

  await prisma.waiverSignature.deleteMany({ where: { guestId: { in: guests.map((g) => g.id) } } });
  await prisma.guest.deleteMany({ where: { id: { in: guests.map((g) => g.id) } } });
  await prisma.eventLog.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ eventId: { in: eventIds } }, { userId: { in: userIds } }] } });
  await prisma.rsvp.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.$disconnect();
}

main();
