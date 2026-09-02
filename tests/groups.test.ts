import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { createRsvp } from "@/lib/rsvp/rsvp";
import { GroupWaiverNotAcceptedError } from "@/lib/rsvp/errors";
import { POST as createGroupRoute, GET as listGroupsRoute } from "@/app/api/groups/route";
import { POST as joinGroupRoute } from "@/app/api/groups/join/route";
import { GET as listPendingRoute } from "@/app/api/groups/[id]/memberships/route";
import { POST as approveRoute } from "@/app/api/groups/[id]/memberships/[userId]/approve/route";
import { POST as rejectRoute } from "@/app/api/groups/[id]/memberships/[userId]/reject/route";
import { PATCH as updateMembershipRoleRoute } from "@/app/api/groups/[id]/memberships/[userId]/route";
import { PATCH as updateGroupRoute } from "@/app/api/groups/[id]/route";
import { POST as acceptWaiverRoute } from "@/app/api/groups/[id]/waiver/accept/route";
import { GET as listEventsRoute, POST as createEventRoute } from "@/app/api/events/route";
import { GET as getEventRoute, PATCH as patchEventRoute } from "@/app/api/events/[id]/route";
import { POST as rsvpRoute } from "@/app/api/events/[id]/rsvp/route";

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

describe("groups", () => {
  const platformAdminPhone = "+15555550500";
  const groupAdminPhone = "+15555550501";
  const memberPhone = "+15555550502";
  const outsiderPhone = "+15555550503";

  let platformAdminToken: string;
  let groupAdminId: string;
  let groupAdminToken: string;
  let memberId: string;
  let memberToken: string;
  let outsiderId: string;
  let outsiderToken: string;

  const allPhones = [platformAdminPhone, groupAdminPhone, memberPhone, outsiderPhone];
  const groupIds: string[] = [];

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { phone: { in: allPhones } } });
    const userIds = users.map((u) => u.id);
    await prisma.eventLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rsvp.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.event.deleteMany({ where: { createdBy: { in: userIds } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sets up a platform admin, a group admin, a member, and an outsider", async () => {
    const platformAdmin = await prisma.user.create({ data: { phone: platformAdminPhone, role: "admin" } });
    const groupAdmin = await prisma.user.create({ data: { phone: groupAdminPhone } });
    const member = await prisma.user.create({ data: { phone: memberPhone } });
    const outsider = await prisma.user.create({ data: { phone: outsiderPhone } });

    groupAdminId = groupAdmin.id;
    memberId = member.id;
    outsiderId = outsider.id;

    platformAdminToken = (await createSession(platformAdmin.id)).token;
    groupAdminToken = (await createSession(groupAdmin.id)).token;
    memberToken = (await createSession(member.id)).token;
    outsiderToken = (await createSession(outsider.id)).token;
  });

  it("group creation is platform-admin-only", async () => {
    const body = { name: "Open Test Group", joinPolicy: "open", adminPhone: groupAdminPhone };

    const memberAttempt = await createGroupRoute(req("http://localhost/api/groups", { method: "POST", body, token: memberToken }));
    expect(memberAttempt.status).toBe(403);

    const anon = await createGroupRoute(req("http://localhost/api/groups", { method: "POST", body }));
    expect(anon.status).toBe(401);

    const res = await createGroupRoute(
      req("http://localhost/api/groups", { method: "POST", body, token: platformAdminToken }),
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    groupIds.push(created.group.id);

    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: created.group.id, userId: groupAdminId } },
    });
    expect(membership).toMatchObject({ role: "admin", status: "active" });
  });

  it("open group: joining activates immediately and is idempotent", async () => {
    const group = await prisma.group.findFirst({ where: { name: "Open Test Group" } });
    const joinCode = group!.joinCode;

    const first = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: joinCode }, token: memberToken }),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe("active");

    const second = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: joinCode }, token: memberToken }),
    );
    expect(second.status).toBe(200);
    expect((await second.json()).status).toBe("active");

    const rows = await prisma.groupMembership.findMany({ where: { groupId: group!.id, userId: memberId } });
    expect(rows).toHaveLength(1); // idempotent — no duplicate row
  });

  it("invalid join code is rejected", async () => {
    const res = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: "not-a-real-code" }, token: memberToken }),
    );
    expect(res.status).toBe(404);
  });

  it("approval group: joining is pending until a group admin decides, and reject can be resubmitted", async () => {
    const createRes = await createGroupRoute(
      req("http://localhost/api/groups", {
        method: "POST",
        body: { name: "Approval Test Group", joinPolicy: "approval", adminPhone: groupAdminPhone },
        token: platformAdminToken,
      }),
    );
    const group = (await createRes.json()).group;
    groupIds.push(group.id);

    const joinRes = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: group.joinCode }, token: outsiderToken }),
    );
    expect((await joinRes.json()).status).toBe("pending");

    // A plain member (not this group's admin) can't see or decide the queue.
    const memberList = await listPendingRoute(req(`http://localhost/api/groups/${group.id}/memberships`, { token: memberToken }), {
      params: Promise.resolve({ id: group.id }),
    });
    expect(memberList.status).toBe(403);

    const adminList = await listPendingRoute(req(`http://localhost/api/groups/${group.id}/memberships`, { token: groupAdminToken }), {
      params: Promise.resolve({ id: group.id }),
    });
    expect(adminList.status).toBe(200);
    const pending = (await adminList.json()).pending;
    expect(pending.map((p: { userId: string }) => p.userId)).toContain(outsiderId);

    const rejectRes = await rejectRoute(
      req(`http://localhost/api/groups/${group.id}/memberships/${outsiderId}/reject`, { method: "POST", token: groupAdminToken }),
      { params: Promise.resolve({ id: group.id, userId: outsiderId }) },
    );
    expect(rejectRes.status).toBe(200);
    expect((await rejectRes.json()).status).toBe("rejected");

    // Resubmitting the same code moves rejected -> pending again, not stuck forever.
    const resubmit = await joinGroupRoute(
      req("http://localhost/api/groups/join", { method: "POST", body: { code: group.joinCode }, token: outsiderToken }),
    );
    expect((await resubmit.json()).status).toBe("pending");

    const approveRes = await approveRoute(
      req(`http://localhost/api/groups/${group.id}/memberships/${outsiderId}/approve`, { method: "POST", token: groupAdminToken }),
      { params: Promise.resolve({ id: group.id, userId: outsiderId }) },
    );
    expect(approveRes.status).toBe(200);
    expect((await approveRes.json()).status).toBe("active");

    const rows = await prisma.groupMembership.findMany({ where: { groupId: group.id, userId: outsiderId } });
    expect(rows).toHaveLength(1); // still one row throughout pending -> rejected -> pending -> active
  });

  it("GET /api/groups lists only the caller's own memberships, with status", async () => {
    const res = await listGroupsRoute(req("http://localhost/api/groups", { token: memberToken }));
    const body = await res.json();
    const names = body.groups.map((g: { name: string }) => g.name);
    expect(names).toContain("Open Test Group");
    expect(names).not.toContain("Approval Test Group"); // member never joined this one
  });

  it("group waiver: required on an opt-in event, independent of the platform waiver", async () => {
    const group = await prisma.group.findFirst({ where: { name: "Open Test Group" } });

    const setWaiver = await updateGroupRoute(
      req(`http://localhost/api/groups/${group!.id}`, {
        method: "PATCH",
        body: { waiverContent: "Don't sue us." },
        token: groupAdminToken,
      }),
      { params: Promise.resolve({ id: group!.id }) },
    );
    expect(setWaiver.status).toBe(200);

    const event = await prisma.event.create({
      data: {
        groupId: group!.id,
        title: "Waiver Required Night",
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        timezone: "America/New_York",
        signupOpensAt: new Date(Date.now() - 1000),
        locationRevealPolicy: "always",
        waiverRequired: true,
        createdBy: groupAdminId,
      },
    });

    // memberId has no platform-waiver acceptance either — but that's a
    // separate gate (WaiverNotAcceptedError); give them the platform waiver
    // so this test isolates the *group* waiver check.
    await prisma.user.update({
      where: { id: memberId },
      data: { waiverAcceptedAt: new Date(), waiverVersion: (await import("@/lib/waivers/content")).WAIVER_VERSION },
    });

    await expect(createRsvp(event.id, memberId)).rejects.toBeInstanceOf(GroupWaiverNotAcceptedError);

    const acceptRes = await acceptWaiverRoute(
      req(`http://localhost/api/groups/${group!.id}/waiver/accept`, { method: "POST", token: memberToken }),
      { params: Promise.resolve({ id: group!.id }) },
    );
    expect(acceptRes.status).toBe(200);

    const rsvp = await createRsvp(event.id, memberId);
    expect(rsvp.status).toBe("active");
  });

  it("two groups are isolated at the event level, not just membership", async () => {
    const approvalGroup = await prisma.group.findFirst({ where: { name: "Approval Test Group" } });

    // groupAdmin administers both groups created in this file; memberId is
    // only ever a member of "Open Test Group".
    const createRes = await createEventRoute(
      req("http://localhost/api/events", {
        method: "POST",
        token: groupAdminToken,
        body: {
          groupId: approvalGroup!.id,
          title: "Approval Group Only Night",
          startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          timezone: "America/New_York",
          signupOpensAt: new Date(Date.now() - 1000).toISOString(),
          locationRevealPolicy: "always",
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const otherGroupEvent = (await createRes.json()).event;

    const listRes = await listEventsRoute(req("http://localhost/api/events", { token: memberToken }));
    const listedIds = (await listRes.json()).events.map((e: { id: string }) => e.id);
    expect(listedIds).not.toContain(otherGroupEvent.id);

    const getRes = await getEventRoute(req(`http://localhost/api/events/${otherGroupEvent.id}`, { token: memberToken }), {
      params: Promise.resolve({ id: otherGroupEvent.id }),
    });
    expect(getRes.status).toBe(404);

    const rsvpRes = await rsvpRoute(
      req(`http://localhost/api/events/${otherGroupEvent.id}/rsvp`, { method: "POST", token: memberToken }),
      { params: Promise.resolve({ id: otherGroupEvent.id }) },
    );
    expect(rsvpRes.status).toBe(404);

    // Meanwhile outsiderId (an active member of the approval group) can see it fine.
    const outsiderGetRes = await getEventRoute(
      req(`http://localhost/api/events/${otherGroupEvent.id}`, { token: outsiderToken }),
      { params: Promise.resolve({ id: otherGroupEvent.id }) },
    );
    expect(outsiderGetRes.status).toBe(200);
  });

  it("a platform admin has full control over a group they have no membership row in at all", async () => {
    const openGroup = await prisma.group.findFirst({ where: { name: "Open Test Group" } });
    const platformAdmin = await prisma.user.findUniqueOrThrow({ where: { phone: platformAdminPhone } });
    expect(
      await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: openGroup!.id, userId: platformAdmin.id } },
      }),
    ).toBeNull();

    const createRes = await createEventRoute(
      req("http://localhost/api/events", {
        method: "POST",
        token: platformAdminToken,
        body: {
          groupId: openGroup!.id,
          title: "Platform Admin Override Night",
          startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          timezone: "America/New_York",
          signupOpensAt: new Date(Date.now() - 1000).toISOString(),
          locationRevealPolicy: "always",
        },
      }),
    );
    expect(createRes.status).toBe(201); // creation succeeds with no membership row
    const event = (await createRes.json()).event;

    const getRes = await getEventRoute(req(`http://localhost/api/events/${event.id}`, { token: platformAdminToken }), {
      params: Promise.resolve({ id: event.id }),
    });
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).viewerRole).toBe("admin"); // sees phone numbers etc., not demoted to "member"

    const patchRes = await patchEventRoute(
      req(`http://localhost/api/events/${event.id}`, { method: "PATCH", body: { title: "Renamed by platform admin" }, token: platformAdminToken }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(patchRes.status).toBe(200);

    // A plain member of the same group (not its admin) still can't.
    const memberPatchRes = await patchEventRoute(
      req(`http://localhost/api/events/${event.id}`, { method: "PATCH", body: { title: "Hacked" }, token: memberToken }),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(memberPatchRes.status).toBe(403);

    expect(platformAdmin.role).toBe("admin"); // sanity: this really is the platform-role tier being exercised
  });

  it("membership role changes: only a group admin can promote/demote, and the last admin can't be demoted", async () => {
    const group = await prisma.group.findFirst({ where: { name: "Open Test Group" } });

    // memberId is a plain active member here (joined earlier); they can't promote themselves.
    const selfPromote = await updateMembershipRoleRoute(
      req(`http://localhost/api/groups/${group!.id}/memberships/${memberId}`, {
        method: "PATCH",
        body: { role: "admin" },
        token: memberToken,
      }),
      { params: Promise.resolve({ id: group!.id, userId: memberId }) },
    );
    expect(selfPromote.status).toBe(403);

    const promote = await updateMembershipRoleRoute(
      req(`http://localhost/api/groups/${group!.id}/memberships/${memberId}`, {
        method: "PATCH",
        body: { role: "admin" },
        token: groupAdminToken,
      }),
      { params: Promise.resolve({ id: group!.id, userId: memberId }) },
    );
    expect(promote.status).toBe(200);
    expect((await promote.json()).role).toBe("admin");

    // Two admins now (groupAdmin, member) — groupAdmin demoting themself is fine.
    const demoteSelf = await updateMembershipRoleRoute(
      req(`http://localhost/api/groups/${group!.id}/memberships/${groupAdminId}`, {
        method: "PATCH",
        body: { role: "member" },
        token: groupAdminToken,
      }),
      { params: Promise.resolve({ id: group!.id, userId: groupAdminId }) },
    );
    expect(demoteSelf.status).toBe(200);

    // Restore for later tests/cleanup assumptions, but only after proving
    // the guard: memberId is now the sole admin — demoting them must fail.
    const demoteLastAdmin = await updateMembershipRoleRoute(
      req(`http://localhost/api/groups/${group!.id}/memberships/${memberId}`, {
        method: "PATCH",
        body: { role: "member" },
        token: memberToken,
      }),
      { params: Promise.resolve({ id: group!.id, userId: memberId }) },
    );
    expect(demoteLastAdmin.status).toBe(409);

    // Put groupAdmin back so it stays "the" admin for anything relying on
    // that assumption elsewhere (there's nothing after this in this file,
    // but this keeps the fixture state legible if more tests are added).
    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId: group!.id, userId: groupAdminId } },
      data: { role: "admin" },
    });
  });
});
