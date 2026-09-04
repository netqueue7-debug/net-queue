import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";

// Platform-admin only (policy.md#6) — a real group admin now manages their
// group entirely from /groups (event creation/viewing on the group card,
// pending members under the card's Members section), so there's nothing
// left here for them.
export default async function AdminHomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");
  if (user.role !== "admin") redirect("/groups");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Link href="/admin/groups" className="underline">
        All groups
      </Link>
    </main>
  );
}
