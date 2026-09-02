import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow, listPublicMembers, getActiveMemberCount } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { Card } from "@/components/ui/card";
import { Linkify } from "@/components/ui/linkify";
import { EditDescriptionForm } from "./edit-description-form";
import { EditWaiverForm } from "./edit-waiver-form";
import { GroupImageUploader } from "./group-image-uploader";
import { InviteLinkCard } from "./invite-link-card";

export default async function GroupAboutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;

  const membership = await resolveGroupMembership(id, user.id);
  if (!membership) notFound();

  let group;
  try {
    group = await getGroupOrThrow(id);
  } catch (e) {
    if (e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const members = await listPublicMembers(id);
  const admins = members.filter((m) => m.role === "admin");

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  const activeMemberCount = membership.role === "admin" ? await getActiveMemberCount(id) : 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div>
        <Link href="/groups" className="text-sm text-muted hover:underline">
          ← Your groups
        </Link>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
      </div>

      {membership.role === "admin" ? (
        <GroupImageUploader groupId={id} initialImageUrl={group.imageUrl} />
      ) : (
        group.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry
          <img src={group.imageUrl} alt="" className="aspect-[2/1] w-full rounded-lg object-cover" />
        )
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-muted">About</h2>
        {membership.role === "admin" ? (
          <EditDescriptionForm groupId={id} initialDescription={group.description ?? ""} />
        ) : (
          <p className="whitespace-pre-wrap text-sm">
            {group.description ? <Linkify text={group.description} /> : "No description yet."}
          </p>
        )}
      </Card>

      {membership.role === "admin" && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-muted">Invite link</h2>
          <InviteLinkCard
            groupId={id}
            origin={origin}
            initialJoinCode={group.joinCode}
            memberLimit={group.memberLimit}
            activeMemberCount={activeMemberCount}
          />
        </Card>
      )}

      {membership.role === "admin" && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-muted">Waiver</h2>
          <EditWaiverForm groupId={id} initialContent={group.waiverContent ?? ""} initialVersion={group.waiverVersion} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-muted">Organizers</h2>
        {admins.length === 0 ? (
          <p className="text-sm text-muted">No admins listed.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {admins.map((a) => (
              <li key={a.userId} className="text-sm">
                {a.displayName ?? "Member"}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
