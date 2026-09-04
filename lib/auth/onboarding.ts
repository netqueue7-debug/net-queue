import type { User } from "@/lib/generated/prisma/client";

export function needsOnboarding(user: User): boolean {
  return !user.displayName;
}
