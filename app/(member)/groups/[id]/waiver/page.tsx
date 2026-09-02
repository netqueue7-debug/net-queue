import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { getGroupWaiverStatus } from "@/lib/groups/groups";
import { GroupNotFoundError, MembershipNotFoundError } from "@/lib/groups/errors";
import { AcceptGroupWaiverForm } from "./accept-group-waiver-form";
import { WaiverPanel } from "@/components/ui/waiver-panel";

export default async function GroupWaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;

  let status;
  try {
    status = await getGroupWaiverStatus(id, user.id);
  } catch (e) {
    if (e instanceof GroupNotFoundError || e instanceof MembershipNotFoundError) notFound();
    throw e;
  }

  if (status.waiverVersion === null) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Group waiver</h1>

      {status.accepted ? (
        <p className="text-muted">You&apos;ve already accepted the current version of this waiver.</p>
      ) : (
        <>
          <WaiverPanel content={status.waiverContent} />
          <AcceptGroupWaiverForm groupId={id} />
        </>
      )}
    </main>
  );
}
