import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createTestGroup, deleteTestGroup, addActiveMembership } from "./helpers/test-group";
import { POST as selfJoinRoute } from "@/app/api/groups/[id]/memberships/self/route";

function req(url: string, opts: { token?: string } = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: opts.token ? { cookie: `session=${opts.token}` } : undefined,
  });
}

function call(groupId: string, token?: string) {
  return selfJoinRoute(req(`http://localhost/api/groups/${groupId}/memberships/self`, { token }), {
    params: Promise.resolve({ id: groupId }),
  });
}

describe("platform-admin self-join (break glass)", () => {
  const platformAdminPhone = "+15555550950";
  const otherGroupAdminPhone = "+15555550951";
  const memberPhone = "+15555550952";
  const allPhones = [platformAdminPhone, otherGroupAdminPhone, memberPhone];
  const groupIds: string[] = [];

  let platformAdminId: string;
  let platformAdminToken: string;
  let otherGroupAdminId: string;
  let otherGroupAdminToken: string;
  let memberId: string;
  let memberToken: string;
  let targetGroupId: string;
  let unrelatedGroupId: string;

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { phone: { in: allPhones } } });
    const userIds = users.map((u) => u.id);
    for (const groupId of groupIds) await deleteTestGroup(groupId);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sets up a platform admin, an unrelated group's admin, a member, and two groups", async () => {
    const platformAdmin = await prisma.user.create({ data: { phone: platformAdminPhone, role: "admin" } });
    const otherGroupAdmin = await prisma.user.create({ data: { phone: otherGroupAdminPhone } });
    const member = await prisma.user.create({ data: { phone: memberPhone } });

    platformAdminId = platformAdmin.id;
    otherGroupAdminId = otherGroupAdmin.id;
    memberId = member.id;
    platformAdminToken = (await createSession(platformAdmin.id)).token;
    otherGroupAdminToken = (await createSession(otherGroupAdmin.id)).token;
    memberToken = (await createSession(member.id)).token;

    const target = await createTestGroup(platformAdminId, "Self-Join Target Group");
    targetGroupId = target.id;
    groupIds.push(targetGroupId);

    const unrelated = await createTestGroup(platformAdminId, "Self-Join Unrelated Group");
    unrelatedGroupId = unrelated.id;
    groupIds.push(unrelatedGroupId);
    await addActiveMembership(unrelatedGroupId, otherGroupAdminId, "admin");
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await call(targetGroupId);
    expect(res.status).toBe(401);
  });

  it("rejects a plain member (not a platform admin)", async () => {
    const res = await call(targetGroupId, memberToken);
    expect(res.status).toBe(403);

    const row = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: targetGroupId, userId: memberId } } });
    expect(row).toBeNull();
  });

  it("rejects a real group admin of an unrelated group — requireAdmin, not assertGroupAdmin, gates this", async () => {
    const res = await call(targetGroupId, otherGroupAdminToken);
    expect(res.status).toBe(403);

    const row = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: targetGroupId, userId: otherGroupAdminId } },
    });
    expect(row).toBeNull();
  });

  it("404s for a nonexistent group", async () => {
    const res = await call("nonexistent-group-id", platformAdminToken);
    expect(res.status).toBe(404);
  });

  it("lets the platform admin self-join with no prior membership row", async () => {
    const before = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: targetGroupId, userId: platformAdminId } },
    });
    expect(before).toBeNull();

    const res = await call(targetGroupId, platformAdminToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ role: "admin", status: "active" });

    const row = await prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: targetGroupId, userId: platformAdminId } },
    });
    expect(row.role).toBe("admin");
    expect(row.status).toBe("active");
  });

  it("is idempotent on a repeat call", async () => {
    const res = await call(targetGroupId, platformAdminToken);
    expect(res.status).toBe(200);

    const rows = await prisma.groupMembership.findMany({ where: { groupId: targetGroupId, userId: platformAdminId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].status).toBe("active");
  });

  it("upgrades an existing pending/plain-member row straight to active admin", async () => {
    // The platform admin has never touched unrelatedGroupId before this test —
    // seed a pending, non-admin row to prove self-join upgrades it in place.
    await prisma.groupMembership.create({
      data: { groupId: unrelatedGroupId, userId: platformAdminId, role: "member", status: "pending" },
    });

    const res = await call(unrelatedGroupId, platformAdminToken);
    expect(res.status).toBe(200);

    const row = await prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId: unrelatedGroupId, userId: platformAdminId } },
    });
    expect(row.role).toBe("admin");
    expect(row.status).toBe("active");
  });
});
