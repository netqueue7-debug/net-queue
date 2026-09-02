import { prisma } from "@/lib/db";
import type { User } from "@/lib/generated/prisma/client";

export async function updateDisplayName(userId: string, displayName: string): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { displayName } });
}
