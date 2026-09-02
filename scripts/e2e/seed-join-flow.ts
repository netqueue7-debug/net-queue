import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

// Seeds fixtures for e2e/join-flow.spec.ts — real pages, real clicks, real
// DB mutations, but sessions are injected directly (same pattern as
// scripts/e2e/seed-member-rsvp-flow.ts) rather than driving real OTP
// through the browser, which is already covered elsewhere
// (tests/otp-verify-route.test.ts) and would otherwise cost a real SMS per
// run for no new coverage.
async function main() {
  const { prisma } = await import("../../lib/db");
  const { createSession } = await import("../../lib/auth/session");
  const { WAIVER_VERSION } = await import("../../lib/waivers/content");

  const groupAdminPhone = "+15555550410";
  const memberOpenPhone = "+15555550411";
  const memberApprovalPhone = "+15555550412";
  const notOnboardedPhone = "+15555550413";

  const groupAdmin = await prisma.user.upsert({
    where: { phone: groupAdminPhone },
    update: {},
    create: {
      phone: groupAdminPhone,
      displayName: "E2E Group Admin",
      waiverVersion: WAIVER_VERSION,
      waiverAcceptedAt: new Date(),
    },
  });
  const memberOpen = await prisma.user.upsert({
    where: { phone: memberOpenPhone },
    update: {},
    create: {
      phone: memberOpenPhone,
      displayName: "E2E Open Joiner",
      waiverVersion: WAIVER_VERSION,
      waiverAcceptedAt: new Date(),
    },
  });
  const memberApproval = await prisma.user.upsert({
    where: { phone: memberApprovalPhone },
    update: {},
    create: {
      phone: memberApprovalPhone,
      displayName: "E2E Approval Joiner",
      waiverVersion: WAIVER_VERSION,
      waiverAcceptedAt: new Date(),
    },
  });
  // Deliberately not onboarded (no displayName, no waiver) — used to prove
  // /join/:code redirects through /onboarding, not just /login.
  const notOnboarded = await prisma.user.upsert({
    where: { phone: notOnboardedPhone },
    update: {},
    create: { phone: notOnboardedPhone },
  });

  const openGroup = await prisma.group.create({
    data: {
      name: "E2E Join Flow Open Group",
      joinPolicy: "open",
      joinCode: randomBytes(8).toString("base64url"),
      createdBy: groupAdmin.id,
    },
  });
  const approvalGroup = await prisma.group.create({
    data: {
      name: "E2E Join Flow Approval Group",
      joinPolicy: "approval",
      joinCode: randomBytes(8).toString("base64url"),
      createdBy: groupAdmin.id,
    },
  });
  await prisma.groupMembership.createMany({
    data: [
      { groupId: openGroup.id, userId: groupAdmin.id, role: "admin", status: "active" },
      { groupId: approvalGroup.id, userId: groupAdmin.id, role: "admin", status: "active" },
    ],
  });

  const groupAdminSession = await createSession(groupAdmin.id);
  const memberOpenSession = await createSession(memberOpen.id);
  const memberApprovalSession = await createSession(memberApproval.id);
  const notOnboardedSession = await createSession(notOnboarded.id);

  console.log(
    JSON.stringify({
      groupAdminToken: groupAdminSession.token,
      groupAdminExpiresAt: groupAdminSession.expiresAt.toISOString(),
      memberOpenToken: memberOpenSession.token,
      memberOpenExpiresAt: memberOpenSession.expiresAt.toISOString(),
      memberApprovalToken: memberApprovalSession.token,
      memberApprovalExpiresAt: memberApprovalSession.expiresAt.toISOString(),
      notOnboardedToken: notOnboardedSession.token,
      notOnboardedExpiresAt: notOnboardedSession.expiresAt.toISOString(),
      openGroupId: openGroup.id,
      openGroupJoinCode: openGroup.joinCode,
      approvalGroupId: approvalGroup.id,
      approvalGroupJoinCode: approvalGroup.joinCode,
      memberApprovalUserId: memberApproval.id,
      phones: [groupAdminPhone, memberOpenPhone, memberApprovalPhone, notOnboardedPhone],
    }),
  );
  await prisma.$disconnect();
}

main();
