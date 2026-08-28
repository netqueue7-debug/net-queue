import type { User } from "@/lib/generated/prisma/client";
import { WAIVER_VERSION } from "@/lib/waivers/content";

export function needsOnboarding(user: User): boolean {
  return !user.displayName || user.waiverVersion !== WAIVER_VERSION;
}
