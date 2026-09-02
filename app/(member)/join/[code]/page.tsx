import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { joinGroupByCode, type JoinResult } from "@/lib/groups/groups";
import { InvalidJoinCodeError, GroupMemberLimitReachedError } from "@/lib/groups/errors";

// Single entry point for both a brand-new phone number and an
// already-registered one (docs/phase-0b-groups.md) — an unauthenticated or
// not-yet-onboarded visitor is bounced through login/onboarding with `next`
// pointing right back here, so the join itself only ever runs once the
// visitor is a real, onboarded member.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getSession();
  const here = `/join/${code}`;

  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (needsOnboarding(user)) redirect(`/onboarding?next=${encodeURIComponent(here)}`);

  let result: JoinResult | null = null;
  let invalid = false;
  let atCapacity = false;
  try {
    result = await joinGroupByCode(user.id, code);
  } catch (e) {
    if (e instanceof GroupMemberLimitReachedError) {
      atCapacity = true;
    } else if (e instanceof InvalidJoinCodeError) {
      invalid = true;
    } else {
      throw e;
    }
  }

  if (invalid) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-8">
        <h1 className="text-2xl font-semibold">Invalid invite</h1>
        <p className="text-muted">This join link isn&apos;t valid. Ask whoever shared it for a new one.</p>
      </main>
    );
  }

  if (atCapacity) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-8">
        <h1 className="text-2xl font-semibold">Group is full</h1>
        <p className="text-muted">
          This group has reached its member limit and isn&apos;t accepting new members right now. Ask a group admin to
          check with a platform admin about increasing it.
        </p>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-8">
        <h1 className="text-2xl font-semibold">Invalid invite</h1>
        <p className="text-muted">This join link isn&apos;t valid. Ask whoever shared it for a new one.</p>
      </main>
    );
  }

  const { group, membership } = result;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center sm:p-8">
      {membership.status === "active" ? (
        <>
          <h1 className="text-2xl font-semibold">You&apos;re in!</h1>
          <p className="text-muted">You&apos;ve joined {group.name}.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Request sent</h1>
          <p className="text-muted">{group.name} requires admin approval to join. You&apos;ll see its events once you&apos;re approved.</p>
        </>
      )}
      <Link href="/events" className="underline">
        Go to events
      </Link>
    </main>
  );
}
