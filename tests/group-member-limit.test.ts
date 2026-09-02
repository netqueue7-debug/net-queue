import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { joinGroupByCode, approveMembership, setGroupMemberLimit, getActiveMemberCount } from "@/lib/groups/groups";
import { GroupMemberLimitReachedError } from "@/lib/groups/errors";
import { addActiveMembership, createTestGroup, deleteTestGroup } from "./helpers/test-group";
import { POST as joinGroupRoute } from "@/app/api/groups/join/route";
import { PATCH as memberLimitRoute } from "@/app/api/groups/[id]/member-limit/route";

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

describe("group member limit", () => {
  const platformAdminPhone = "+15555551700";
  const groupAdminPhone = "+15555551701";
  const phones = [
    platformAdminPhone,
    groupAdminPhone,
    "+15555551702",
    "+15555551703",
    "+15555551704",
    "+15555551705",
  ];

  let platformAdminId: string;
  let platformAdminToken: string;
  let groupAdminId: string;
  let groupAdminToken: string;
  let userIds: string[];
  let userTokens: string[];

  beforeAll(async () => {
    const platformAdmin = await prisma.user.create({ data: { phone: platformAdminPhone, role: "admin" } });
    const groupAdmin = await prisma.user.create({ data: { phone: groupAdminPhone } });
    platformAdminId = platformAdmin.id;
    groupAdminId = groupAdmin.id;
    platformAdminToken = (await createSession(platformAdmin.id)).token;
    groupAdminToken = (await createSession(groupAdmin.id)).token;

    const others = await Promise.all(phones.slice(2).map((phone) => prisma.user.create({ data: { phone } })));
    userIds = others.map((u) => u.id);
    userTokens = await Promise.all(userIds.map((id) => createSession(id).then((s) => s.token)));
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { phone: { in: phones } } });
    const allIds = users.map((u) => u.id);
    const groups = await prisma.group.findMany({ where: { createdBy: { in: allIds } } });
    for (const g of groups) await deleteTestGroup(g.id);
    await prisma.user.deleteMany({ where: { id: { in: allIds } } });
  });

  it("an open-policy group blocks a new join once active membership reaches its limit", async () => {
    const group = await createTestGroup(platformAdminId, "Open Limit Group");
    await addActiveMembership(group.id, groupAdminId, "admin");
    await setGroupMemberLimit(group.id, 2); // groupAdmin already counts as 1

    const first = await joinGroupByCode(userIds[0], group.joinCode);
    expect(first.membership.status).toBe("active");
    expect(await getActiveMemberCount(group.id)).toBe(2);

    await expect(joinGroupByCode(userIds[1], group.joinCode)).rejects.toBeInstanceOf(GroupMemberLimitReachedError);
    expect(await getActiveMemberCount(group.id)).toBe(2); // unchanged

    // The blocked join never created a membership row at all — rejected
    // before the write, not left behind in some other status.
    const rejectedRow = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: userIds[1] } },
    });
    expect(rejectedRow).toBeNull();
  });

  it("an approval-policy group still accepts the pending request past the limit, but approving it is blocked", async () => {
    const group = await createTestGroup(platformAdminId, "Approval Limit Group");
    await prisma.group.update({ where: { id: group.id }, data: { joinPolicy: "approval" } });
    await addActiveMembership(group.id, groupAdminId, "admin");
    await setGroupMemberLimit(group.id, 1); // groupAdmin alone already fills it

    const joined = await joinGroupByCode(userIds[2], group.joinCode);
    expect(joined.membership.status).toBe("pending"); // request itself isn't blocked

    await expect(approveMembership(group.id, userIds[2])).rejects.toBeInstanceOf(GroupMemberLimitReachedError);

    const stillPending = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: userIds[2] } },
    });
    expect(stillPending?.status).toBe("pending");
  });

  it("raising the limit lets a previously-blocked approval go through", async () => {
    const group = await createTestGroup(platformAdminId, "Raise Limit Group");
    await prisma.group.update({ where: { id: group.id }, data: { joinPolicy: "approval" } });
    await addActiveMembership(group.id, groupAdminId, "admin");
    await setGroupMemberLimit(group.id, 1);

    await joinGroupByCode(userIds[3], group.joinCode);
    await expect(approveMembership(group.id, userIds[3])).rejects.toBeInstanceOf(GroupMemberLimitReachedError);

    await setGroupMemberLimit(group.id, 2);
    const approved = await approveMembership(group.id, userIds[3]);
    expect(approved.status).toBe("active");
  });

  it("PATCH /api/groups/:id/member-limit is platform-admin-only, not just group-admin", async () => {
    const group = await createTestGroup(platformAdminId, "Route Gating Group");
    await addActiveMembership(group.id, groupAdminId, "admin");

    const groupAdminAttempt = await memberLimitRoute(
      req(`http://localhost/api/groups/${group.id}/member-limit`, { method: "PATCH", body: { memberLimit: 5 }, token: groupAdminToken }),
      { params: Promise.resolve({ id: group.id }) },
    );
    expect(groupAdminAttempt.status).toBe(403);

    const platformAdminAttempt = await memberLimitRoute(
      req(`http://localhost/api/groups/${group.id}/member-limit`, {
        method: "PATCH",
        body: { memberLimit: 5 },
        token: platformAdminToken,
      }),
      { params: Promise.resolve({ id: group.id }) },
    );
    expect(platformAdminAttempt.status).toBe(200);

    const refetched = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(refetched.memberLimit).toBe(5);
  });

  it("POST /api/groups/join returns 409 with a clear message once an open group is at capacity", async () => {
    const group = await createTestGroup(platformAdminId, "Route Capacity Group");
    await addActiveMembership(group.id, groupAdminId, "admin");
    await setGroupMemberLimit(group.id, 1);

    const res = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: group.joinCode }, token: userTokens[0] }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/member limit/i);
  });
});
