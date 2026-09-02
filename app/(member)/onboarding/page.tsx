import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSession();
  const { next } = await searchParams;
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  if (!needsOnboarding(user)) redirect(next ?? "/home");

  return <OnboardingForm next={next} />;
}
