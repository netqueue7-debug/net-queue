import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getGroupOrThrow } from "@/lib/groups/groups";
import { GroupNotFoundError } from "@/lib/groups/errors";
import { listSeriesForGroup as listSeries } from "@/lib/events/series";
import { CreateSeriesForm } from "./create-series-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GroupSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  let group;
  try {
    group = await getGroupOrThrow(id);
  } catch (e) {
    if (e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const series = await listSeries(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{group.name}: Recurring series</h1>
        <Link href={`/admin/groups/${id}/events`} className="text-sm underline">
          Events
        </Link>
      </div>

      {series.length === 0 && <EmptyState>No recurring series yet.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {series.map((s) => (
          <li key={s.id}>
            <Card className="p-3">
              <Link href={`/admin/groups/${id}/series/${s.id}`} className="font-medium underline">
                {s.title}
              </Link>
              <span className="ml-2 text-sm text-muted">until {new Date(s.recurUntil).toLocaleDateString()}</span>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="text-lg font-medium">Create a series</h2>
      <CreateSeriesForm groupId={id} />
    </main>
  );
}
