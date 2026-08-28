import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";

export default async function MemberHomePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Welcome, {user.displayName}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Member home — events land here in Phase 1.</p>
    </main>
  );
}
