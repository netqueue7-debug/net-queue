import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { deleteBlobBestEffort } from "@/lib/blob";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export class InvalidAvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAvatarError";
  }
}

export class AvatarUploadFailedError extends Error {
  constructor(cause: unknown) {
    super("Failed to upload profile picture.");
    this.name = "AvatarUploadFailedError";
    this.cause = cause;
  }
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new InvalidAvatarError("Profile pictures must be a PNG, JPEG, WebP, or GIF image.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new InvalidAvatarError("Profile pictures must be under 5MB.");
  }

  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });

  const ext = file.type.split("/")[1];
  let blob;
  try {
    blob = await put(`avatars/${userId}.${ext}`, file, { access: "public", addRandomSuffix: true });
  } catch (cause) {
    // The route only returns a generic 502 to the client — log the real
    // cause here so a misconfigured Blob store (missing BLOB_STORE_ID /
    // VERCEL_OIDC_TOKEN, wrong env scope, etc.) is diagnosable from the
    // server logs instead of a bare "Failed to upload profile picture."
    console.error("[avatar-upload] put() failed:", cause);
    throw new AvatarUploadFailedError(cause);
  }

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: blob.url } });

  if (previous?.avatarUrl) deleteBlobBestEffort(previous.avatarUrl);

  return blob.url;
}

export async function removeAvatar(userId: string): Promise<void> {
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  if (!previous?.avatarUrl) return;

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  deleteBlobBestEffort(previous.avatarUrl);
}
