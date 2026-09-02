import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { deleteBlobBestEffort } from "@/lib/blob";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export class InvalidGroupImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGroupImageError";
  }
}

export class GroupImageUploadFailedError extends Error {
  constructor(cause: unknown) {
    super("Failed to upload group image.");
    this.name = "GroupImageUploadFailedError";
    this.cause = cause;
  }
}

export async function uploadGroupImage(groupId: string, file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new InvalidGroupImageError("Group images must be a PNG, JPEG, WebP, or GIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new InvalidGroupImageError("Group images must be under 5MB.");
  }

  const previous = await prisma.group.findUnique({ where: { id: groupId }, select: { imageUrl: true } });

  const ext = file.type.split("/")[1];
  let blob;
  try {
    blob = await put(`groups/${groupId}.${ext}`, file, { access: "public", addRandomSuffix: true });
  } catch (cause) {
    // Same rationale as lib/settings/avatar.ts — the route only returns a
    // generic 502, so log the real cause for diagnosing a misconfigured
    // Blob store from the server logs.
    console.error("[group-image-upload] put() failed:", cause);
    throw new GroupImageUploadFailedError(cause);
  }

  await prisma.group.update({ where: { id: groupId }, data: { imageUrl: blob.url } });

  if (previous?.imageUrl) deleteBlobBestEffort(previous.imageUrl);

  return blob.url;
}

export async function removeGroupImage(groupId: string): Promise<void> {
  const previous = await prisma.group.findUnique({ where: { id: groupId }, select: { imageUrl: true } });
  if (!previous?.imageUrl) return;

  await prisma.group.update({ where: { id: groupId }, data: { imageUrl: null } });
  deleteBlobBestEffort(previous.imageUrl);
}
