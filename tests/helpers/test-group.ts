import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

// Every event now requires a groupId (docs/phase-0b-groups.md). Tests that
// predate groups just need *a* group to attach events to — full group
// scoping/authz is exercised in the groups-specific test files, not here.
export async function createTestGroup(creatorUserId: string, name = "Test Group") {
  return prisma.group.create({
    data: {
      name,
      joinPolicy: "open",
      joinCode: randomBytes(16).toString("base64url"),
      createdBy: creatorUserId,
    },
  });
}

export async function deleteTestGroup(groupId: string) {
  await prisma.groupMembership.deleteMany({ where: { groupId } });
  await prisma.group.delete({ where: { id: groupId } });
}

// createRsvp/cancelRsvp now require an active membership in the event's
// group (docs/phase-0b-groups.md) — most existing tests just need *a*
// membership to keep exercising RSVP logic, not the membership flow itself.
export async function addActiveMembership(groupId: string, userId: string, role: "member" | "admin" = "member") {
  return prisma.groupMembership.create({ data: { groupId, userId, role, status: "active" } });
}
