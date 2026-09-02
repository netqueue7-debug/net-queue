import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const put = vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}` }));
const del = vi.fn(async () => {});
vi.mock("@vercel/blob", () => ({
  put: (...args: Parameters<typeof put>) => put(...args),
  del: (...args: Parameters<typeof del>) => del(...args),
}));

const { uploadAvatar, removeAvatar, InvalidAvatarError } = await import("@/lib/settings/avatar");

function fakeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("settings: avatar", () => {
  const phone = "+15555550304";
  let userId: string;

  beforeEach(async () => {
    put.mockClear();
    del.mockClear();
    const user = await prisma.user.create({ data: { phone } });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { phone } });
  });

  it("rejects a non-image content type without calling Blob", async () => {
    await expect(uploadAvatar(userId, fakeFile("resume.pdf", "application/pdf", 100))).rejects.toBeInstanceOf(InvalidAvatarError);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a file over 5MB without calling Blob", async () => {
    await expect(uploadAvatar(userId, fakeFile("huge.png", "image/png", 6 * 1024 * 1024))).rejects.toBeInstanceOf(InvalidAvatarError);
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads a valid image and stores the resulting URL on the user", async () => {
    const url = await uploadAvatar(userId, fakeFile("me.png", "image/png", 100));
    expect(put).toHaveBeenCalledTimes(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBe(url);
  });

  it("best-effort deletes the previous blob when replacing an avatar", async () => {
    const first = await uploadAvatar(userId, fakeFile("first.png", "image/png", 100));
    await uploadAvatar(userId, fakeFile("second.png", "image/png", 100));

    expect(del).toHaveBeenCalledWith(first);
  });

  it("does not call delete on the first upload (no previous avatar)", async () => {
    await uploadAvatar(userId, fakeFile("first.png", "image/png", 100));
    expect(del).not.toHaveBeenCalled();
  });

  it("removeAvatar clears the field and deletes the blob", async () => {
    const url = await uploadAvatar(userId, fakeFile("me.png", "image/png", 100));
    del.mockClear();

    await removeAvatar(userId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBeNull();
    expect(del).toHaveBeenCalledWith(url);
  });

  it("removeAvatar is a no-op when there's nothing to remove", async () => {
    await removeAvatar(userId);
    expect(del).not.toHaveBeenCalled();
  });
});
