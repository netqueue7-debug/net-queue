import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/auth/session";
import {
  requestGroupUpgrade,
  resolveUpgradeRequest,
  getPendingUpgradeRequestForGroup,
} from "@/lib/groups/upgrade-requests";
import { UpgradeRequestAlreadyPendingError } from "@/lib/groups/errors";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { POST as upgradeRequestRoute } from "@/app/api/groups/[id]/upgrade-request/route";
import { POST as resolveRoute } from "@/app/api/admin/group-upgrade-requests/[id]/resolve/route";

function req(url: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: {
      ...(opts.token ? { cookie: `session=${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
  });
}

describe("group upgrade requests", () => {
  const platformAdminPhone = "+15555551800";
  const groupAdminPhone = "+15555551801";
  const memberPhone = "+15555551802";
  const phones = [platformAdminPhone, groupAdminPhone, memberPhone];

  let platformAdminId: string;
  let platformAdminToken: string;
  let groupAdminId: string;
  let groupAdminToken: string;
  let memberId: string;
  let memberToken: string;

  beforeAll(async () => {
    const platformAdmin = await prisma.user.create({ data: { phone: platformAdminPhone, role: "admin" } });
    const groupAdmin = await prisma.user.create({ data: { phone: groupAdminPhone } });
    const member = await prisma.user.create({ data: { phone: memberPhone } });
    platformAdminId = platformAdmin.id;
    groupAdminId = groupAdmin.id;
    memberId = member.id;
    platformAdminToken = (await createSession(platformAdmin.id)).token;
    groupAdminToken = (await createSession(groupAdmin.id)).token;
    memberToken = (await createSession(member.id)).token;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { phone: { in: phones } } });
    const allIds = users.map((u) => u.id);
    const groups = await prisma.group.findMany({ where: { createdBy: { in: allIds } } });
    for (const g of groups) await deleteTestGroup(g.id);
    await prisma.notification.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  });

  it("a group admin can file a request, which notifies every platform admin", async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group A");
    await addActiveMembership(group.id, groupAdminId, "admin");

    const request = await requestGroupUpgrade(group.id, groupAdminId, { requestedLimit: 50, message: "growing fast" });
    expect(request.status).toBe("pending");
    expect(request.requestedLimit).toBe(50);

    const notification = await prisma.notification.findFirst({
      where: { userId: platformAdminId, type: "group_upgrade_requested" },
    });
    expect(notification).not.toBeNull();
    expect((notification!.payload as Record<string, unknown>).requestId).toBe(request.id);
  });

  it("a plain member cannot file a request", async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group B");
    await addActiveMembership(group.id, memberId, "member");

    await expect(requestGroupUpgrade(group.id, memberId, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a second request while one is pending is rejected", async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group C");
    await addActiveMembership(group.id, groupAdminId, "admin");

    await requestGroupUpgrade(group.id, groupAdminId, {});
    await expect(requestGroupUpgrade(group.id, groupAdminId, {})).rejects.toBeInstanceOf(
      UpgradeRequestAlreadyPendingError,
    );
  });

  it("approving raises the group's memberLimit and notifies the requester; denying leaves it untouched", { timeout: 15_000 }, async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group D");
    await addActiveMembership(group.id, groupAdminId, "admin");

    const approvedRequest = await requestGroupUpgrade(group.id, groupAdminId, { requestedLimit: 25 });
    const resolved = await resolveUpgradeRequest(approvedRequest.id, platformAdminId, {
      decision: "approved",
      newLimit: 25,
    });
    expect(resolved.status).toBe("approved");
    expect(resolved.resolvedBy).toBe(platformAdminId);

    const refetchedGroup = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(refetchedGroup.memberLimit).toBe(25);

    const requesterNotification = await prisma.notification.findFirst({
      where: { userId: groupAdminId, type: "group_upgrade_resolved" },
    });
    expect(requesterNotification).not.toBeNull();
    expect((requesterNotification!.payload as Record<string, unknown>).decision).toBe("approved");

    expect(await getPendingUpgradeRequestForGroup(group.id)).toBeNull();

    const deniedRequest = await requestGroupUpgrade(group.id, groupAdminId, { requestedLimit: 100 });
    await resolveUpgradeRequest(deniedRequest.id, platformAdminId, { decision: "denied" });

    const stillTwentyFive = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(stillTwentyFive.memberLimit).toBe(25);
  });

  it("POST /api/groups/:id/upgrade-request is group-admin-only", async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group E");
    await addActiveMembership(group.id, groupAdminId, "admin");
    await addActiveMembership(group.id, memberId, "member");

    const memberAttempt = await upgradeRequestRoute(
      req(`http://localhost/api/groups/${group.id}/upgrade-request`, { method: "POST", body: {}, token: memberToken }),
      { params: Promise.resolve({ id: group.id }) },
    );
    expect(memberAttempt.status).toBe(403);

    const adminAttempt = await upgradeRequestRoute(
      req(`http://localhost/api/groups/${group.id}/upgrade-request`, {
        method: "POST",
        body: { requestedLimit: 40 },
        token: groupAdminToken,
      }),
      { params: Promise.resolve({ id: group.id }) },
    );
    expect(adminAttempt.status).toBe(201);
  });

  it("POST /api/admin/group-upgrade-requests/:id/resolve is platform-admin-only, not just group-admin", async () => {
    const group = await createTestGroup(platformAdminId, "Upgrade Group F");
    await addActiveMembership(group.id, groupAdminId, "admin");
    const request = await requestGroupUpgrade(group.id, groupAdminId, { requestedLimit: 10 });

    const groupAdminAttempt = await resolveRoute(
      req(`http://localhost/api/admin/group-upgrade-requests/${request.id}/resolve`, {
        method: "POST",
        body: { decision: "approved", newLimit: 10 },
        token: groupAdminToken,
      }),
      { params: Promise.resolve({ id: request.id }) },
    );
    expect(groupAdminAttempt.status).toBe(403);

    const platformAdminAttempt = await resolveRoute(
      req(`http://localhost/api/admin/group-upgrade-requests/${request.id}/resolve`, {
        method: "POST",
        body: { decision: "approved", newLimit: 10 },
        token: platformAdminToken,
      }),
      { params: Promise.resolve({ id: request.id }) },
    );
    expect(platformAdminAttempt.status).toBe(200);
  });
});
