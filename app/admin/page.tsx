import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { getDefaultAdminGroupId } from "@/lib/groups/authz";

export default async function AdminHomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  // A platform admin has full control over every group (policy.md#6) even
  // with no membership row of their own, so "no default group" isn't a
  // reason to bounce them to /home the way it is for a plain member.
  const groupId = await getDefaultAdminGroupId(user.id);
  if (!groupId && user.role !== "admin") redirect("/home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-muted">Admin dashboard — built out in later phases.</p>
      {groupId && (
        <Link href="/admin/events" className="underline">
          Your group&apos;s events
        </Link>
      )}
      {user.role === "admin" && (
        <Link href="/admin/groups" className="underline">
          All groups
        </Link>
      )}
    </main>
  );
}
