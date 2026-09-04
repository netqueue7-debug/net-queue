import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { POST as submitFeedbackRoute } from "@/app/api/feedback/route";
import { GET as listFeedbackRoute } from "@/app/api/admin/feedback/route";
import { POST as resolveFeedbackRoute } from "@/app/api/admin/feedback/[id]/resolve/route";

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

describe("feedback", () => {
  const platformAdminPhone = "+15555551600";
  const memberPhone = "+15555551601";
  const allPhones = [platformAdminPhone, memberPhone];

  let platformAdminToken: string;
  let memberId: string;
  let memberToken: string;

  beforeAll(async () => {
    const platformAdmin = await prisma.user.create({ data: { phone: platformAdminPhone, role: "admin" } });
    const member = await prisma.user.create({ data: { phone: memberPhone } });
    memberId = member.id;
    platformAdminToken = (await createSession(platformAdmin.id)).token;
    memberToken = (await createSession(member.id)).token;
  });

  afterAll(async () => {
    await prisma.feedback.deleteMany({ where: { userId: { in: [memberId] } } });
    await prisma.user.deleteMany({ where: { phone: { in: allPhones } } });
  });

  it("a member can submit feedback, and a platform admin sees it in the list", async () => {
    const postRes = await submitFeedbackRoute(
      req("http://localhost/api/feedback", { method: "POST", body: { type: "bug", body: "RSVP button does nothing" }, token: memberToken }),
    );
    expect(postRes.status).toBe(201);
    const { feedback: created } = await postRes.json();
    expect(created.status).toBe("open");

    const listRes = await listFeedbackRoute(req("http://localhost/api/admin/feedback", { token: platformAdminToken }));
    expect(listRes.status).toBe(200);
    const { feedback } = await listRes.json();
    expect(feedback.some((f: { id: string; body: string }) => f.id === created.id && f.body === "RSVP button does nothing")).toBe(true);
  });

  it("a plain member cannot list or resolve feedback", async () => {
    const listRes = await listFeedbackRoute(req("http://localhost/api/admin/feedback", { token: memberToken }));
    expect(listRes.status).toBe(403);

    const postRes = await submitFeedbackRoute(
      req("http://localhost/api/feedback", { method: "POST", body: { type: "feedback", body: "Dark mode please" }, token: memberToken }),
    );
    const { feedback: created } = await postRes.json();

    const resolveRes = await resolveFeedbackRoute(
      req(`http://localhost/api/admin/feedback/${created.id}/resolve`, { method: "POST", token: memberToken }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(resolveRes.status).toBe(403);
  });

  it("an unauthenticated request cannot submit or list feedback", async () => {
    const postRes = await submitFeedbackRoute(req("http://localhost/api/feedback", { method: "POST", body: { type: "bug", body: "x" } }));
    expect(postRes.status).toBe(401);

    const listRes = await listFeedbackRoute(req("http://localhost/api/admin/feedback"));
    expect(listRes.status).toBe(401);
  });

  it("rejects an empty body or an invalid type", async () => {
    const emptyRes = await submitFeedbackRoute(
      req("http://localhost/api/feedback", { method: "POST", body: { type: "bug", body: "   " }, token: memberToken }),
    );
    expect(emptyRes.status).toBe(400);

    const badTypeRes = await submitFeedbackRoute(
      req("http://localhost/api/feedback", { method: "POST", body: { type: "not-a-type", body: "hello" }, token: memberToken }),
    );
    expect(badTypeRes.status).toBe(400);
  });

  it("a platform admin can resolve a piece of feedback", async () => {
    const postRes = await submitFeedbackRoute(
      req("http://localhost/api/feedback", { method: "POST", body: { type: "bug", body: "Resolve me" }, token: memberToken }),
    );
    const { feedback: created } = await postRes.json();

    const resolveRes = await resolveFeedbackRoute(
      req(`http://localhost/api/admin/feedback/${created.id}/resolve`, { method: "POST", token: platformAdminToken }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(resolveRes.status).toBe(200);
    const { feedback: resolved } = await resolveRes.json();
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("resolving a nonexistent feedback id 404s", async () => {
    const resolveRes = await resolveFeedbackRoute(
      req("http://localhost/api/admin/feedback/not-a-real-id/resolve", { method: "POST", token: platformAdminToken }),
      { params: Promise.resolve({ id: "not-a-real-id" }) },
    );
    expect(resolveRes.status).toBe(404);
  });
});
