import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const checkOtp = vi.fn(async () => true);
vi.mock("@/lib/auth/otp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/otp")>("@/lib/auth/otp");
  return { ...actual, checkOtp: (...args: Parameters<typeof checkOtp>) => checkOtp(...args) };
});

const { POST } = await import("@/app/api/auth/otp/verify/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/otp/verify", () => {
  const phone = "+15555550105";

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects an incorrect code without creating a session", async () => {
    checkOtp.mockResolvedValueOnce(false);

    const res = await POST(request({ phone, code: "000000" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("creates a new user, a session cookie, and reports onboarding is needed", async () => {
    const res = await POST(request({ phone, code: "123456" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^session=/);

    const body = await res.json();
    expect(body.needsOnboarding).toBe(true);

    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user).not.toBeNull();
    expect(user?.displayName).toBeNull();
  });

  it("reuses the existing user on a second verify", async () => {
    await POST(request({ phone, code: "123456" }));
    const before = await prisma.user.findUnique({ where: { phone } });

    await POST(request({ phone, code: "123456" }));
    const after = await prisma.user.findUnique({ where: { phone } });

    expect(after?.id).toBe(before?.id);
  });
});
