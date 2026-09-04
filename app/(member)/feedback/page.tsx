import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { Card } from "@/components/ui/card";
import { FeedbackForm } from "./feedback-form";

export default async function FeedbackPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted">Found a bug or have an idea? Let us know.</p>
      </div>
      <Card className="p-4">
        <FeedbackForm />
      </Card>
    </main>
  );
}
