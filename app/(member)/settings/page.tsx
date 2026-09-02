import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { Card } from "@/components/ui/card";
import { AvatarUploader } from "./avatar-uploader";
import { NameForm } from "./name-form";
import { PhoneForm } from "./phone-form";

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">Profile picture</h2>
          <AvatarUploader initialAvatarUrl={user.avatarUrl} displayName={user.displayName} />
        </div>

        <div className="border-t border-border pt-5">
          <h2 className="mb-3 text-sm font-semibold text-muted">Display name</h2>
          <NameForm initialDisplayName={user.displayName ?? ""} />
        </div>

        <div className="border-t border-border pt-5">
          <h2 className="mb-3 text-sm font-semibold text-muted">Phone number</h2>
          <PhoneForm currentPhone={user.phone} />
        </div>
      </Card>
    </main>
  );
}
