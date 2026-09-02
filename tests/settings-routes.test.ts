import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

const sendOtp = vi.fn(async () => {});
const checkOtp = vi.fn(async () => true);
vi.mock("@/lib/auth/otp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/otp")>("@/lib/auth/otp");
  return {
    ...actual,
    sendOtp: (...args: Parameters<typeof sendOtp>) => sendOtp(...args),
    checkOtp: (...args: Parameters<typeof checkOtp>) => checkOtp(...args),
  };
});

const put = vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}` }));
const del = vi.fn(async () => {});
vi.mock("@vercel/blob", () => ({
  put: (...args: Parameters<typeof put>) => put(...args),
  del: (...args: Parameters<typeof del>) => del(...args),
}));

const { POST: postProfile } = await import("@/app/api/settings/profile/route");
const { POST: postAvatar, DELETE: deleteAvatar } = await import("@/app/api/settings/avatar/route");
const { POST: postPhoneSend } = await import("@/app/api/settings/phone/send/route");
const { POST: postPhoneVerify } = await import("@/app/api/settings/phone/verify/route");

function jsonReq(url: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "POST",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: opts.token ? { cookie: `session=${opts.token}` } : undefined,
  });
}

function formReq(url: string, form: FormData, opts: { method?: string; token?: string } = {}) {
  return new NextRequest(url, {
    method: opts.method ?? "POST",
    body: form,
    headers: opts.token ? { cookie: `session=${opts.token}` } : undefined,
  });
}

describe("settings API routes", () => {
  const phone = "+15555550310";
  const newPhone = "+15555550311";
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { phone, displayName: "Original Name" } });
    userId = user.id;
    token = (await createSession(user.id)).token;
  });

  afterAll(async () => {
    await prisma.otpSendAttempt.deleteMany({ where: { phone: { in: [phone, newPhone] } } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { phone: { in: [phone, newPhone] } } });
  });

  it("rejects every settings route without a session", async () => {
    expect((await postProfile(jsonReq("http://localhost/api/settings/profile", { body: { displayName: "X" } }))).status).toBe(401);
    expect((await postAvatar(formReq("http://localhost/api/settings/avatar", new FormData()))).status).toBe(401);
    expect((await deleteAvatar(jsonReq("http://localhost/api/settings/avatar", { method: "DELETE" }))).status).toBe(401);
    expect((await postPhoneSend(jsonReq("http://localhost/api/settings/phone/send", { body: { phone: newPhone } }))).status).toBe(401);
    expect(
      (await postPhoneVerify(jsonReq("http://localhost/api/settings/phone/verify", { body: { phone: newPhone, code: "1" } }))).status,
    ).toBe(401);
  });

  it("updates the display name", async () => {
    const res = await postProfile(jsonReq("http://localhost/api/settings/profile", { body: { displayName: "New Name" }, token }));
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.displayName).toBe("New Name");
  });

  it("rejects a blank display name", async () => {
    const res = await postProfile(jsonReq("http://localhost/api/settings/profile", { body: { displayName: "  " }, token }));
    expect(res.status).toBe(400);
  });

  it("uploads and then removes an avatar", async () => {
    const form = new FormData();
    form.append("avatar", new File([new Uint8Array(10)], "me.png", { type: "image/png" }));

    const uploadRes = await postAvatar(formReq("http://localhost/api/settings/avatar", form, { token }));
    expect(uploadRes.status).toBe(200);
    const { url } = await uploadRes.json();

    let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBe(url);

    const deleteRes = await deleteAvatar(jsonReq("http://localhost/api/settings/avatar", { method: "DELETE", token }));
    expect(deleteRes.status).toBe(200);

    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBeNull();
  });

  it("changes phone via send + verify", async () => {
    const sendRes = await postPhoneSend(jsonReq("http://localhost/api/settings/phone/send", { body: { phone: newPhone }, token }));
    expect(sendRes.status).toBe(200);
    expect(sendOtp).toHaveBeenCalledWith(newPhone);

    const verifyRes = await postPhoneVerify(
      jsonReq("http://localhost/api/settings/phone/verify", { body: { phone: newPhone, code: "123456" }, token }),
    );
    expect(verifyRes.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phone).toBe(newPhone);
  });
});
