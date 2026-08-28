import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!needsOnboarding(user)) redirect("/home");

  return <OnboardingForm />;
}
