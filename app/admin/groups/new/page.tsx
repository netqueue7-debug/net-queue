import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { CreateGroupForm } from "./create-group-form";

// Platform-admin only (policy.md#6) — group creation is not self-serve.
export default async function NewGroupPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">Create a group</h1>
      <p className="text-sm text-muted">
        For now this is filled in by hand from a request. Later, whoever wants a group can fill out their own form and this screen
        becomes the review/finish step.
      </p>
      <CreateGroupForm />
    </main>
  );
}
