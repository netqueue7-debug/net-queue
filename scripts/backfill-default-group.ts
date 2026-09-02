// Phase 0b backfill (docs/phase-0b-groups.md, Part A): Phase 1 shipped with
// a single global event/RSVP space and no groups at all. This creates one
// "default" group from whatever already exists, so every pre-existing user,
// event, and RSVP keeps behaving exactly as it did before groups existed —
// see the phase doc's exit criterion ("zero data loss ... behaves
// identically to before this phase, from a member's point of view").
//
// Idempotent: safe to run more than once. It finds-or-creates the default
// group by name, upserts memberships, and only stamps `groupId` onto events
// that don't have one yet.
//
// Run with: npm run backfill:default-group
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

const DEFAULT_GROUP_NAME = "Default Group";

function generateJoinCode(): string {
  // Same entropy bar as Phase 2's planned guest waiver tokens
  // (architecture.md) — unguessable, URL-safe.
  return randomBytes(24).toString("base64url");
}

async function main() {
  const { prisma } = await import("../lib/db");

  const platformAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!platformAdmin) {
    console.error(
      "No platform admin exists yet — run `npm run admin:promote -- <phone>` first. " +
        "The default group needs a `createdBy` user, and every existing admin becomes a group admin below.",
    );
    process.exit(1);
  }

  let group = await prisma.group.findFirst({ where: { name: DEFAULT_GROUP_NAME } });
  if (!group) {
    group = await prisma.group.create({
      data: {
        name: DEFAULT_GROUP_NAME,
        joinPolicy: "open", // preserves current behavior: anyone could join before groups existed
        joinCode: generateJoinCode(),
        createdBy: platformAdmin.id,
        // No waiverContent/waiverVersion — this group can't require its own
        // waiver on any event until an admin explicitly sets one.
      },
    });
    console.log(`Created "${DEFAULT_GROUP_NAME}" (${group.id}), join code: ${group.joinCode}`);
  } else {
    console.log(`Using existing "${DEFAULT_GROUP_NAME}" (${group.id}).`);
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true, phone: true } });

  let membershipsCreated = 0;
  for (const user of users) {
    const existing = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
    });
    if (existing) continue;

    await prisma.groupMembership.create({
      data: {
        groupId: group.id,
        userId: user.id,
        role: user.role === "admin" ? "admin" : "member",
        status: "active",
      },
    });
    membershipsCreated++;
  }
  console.log(`Backfilled ${membershipsCreated} membership(s) (${users.length} user(s) total).`);

  // `events.group_id` is NOT NULL in the current schema (it was tightened
  // in the `events_group_id_required` migration right after this backfill
  // ran the one time it needed to, against pre-existing Phase 1 rows —
  // see docs/phase-0b-groups.md, Part A). There is no longer a `groupId:
  // null` event this script could find on a database running the current
  // schema, so that stamping step is gone rather than kept as dead code.

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
