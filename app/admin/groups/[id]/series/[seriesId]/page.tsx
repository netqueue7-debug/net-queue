import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getSeries } from "@/lib/events/series";
import { listEventsForSeries } from "@/lib/events/events";
import { formatDateTime } from "@/lib/format-datetime";
import { CancelSeriesButton } from "./cancel-series-button";
import { Card } from "@/components/ui/card";

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string; seriesId: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id, seriesId } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  const series = await getSeries(seriesId);
  if (!series || series.groupId !== id) notFound();

  const instances = await listEventsForSeries(seriesId);
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{series.title}</h1>
          <p className="text-sm text-muted">
            {series.weekdays.map((d) => weekdayNames[d]).join(", ")} · {series.startTime}–{series.endTime} · {series.timezone}
          </p>
          <p className="text-sm text-muted">Recurs until {new Date(series.recurUntil).toLocaleDateString()}</p>
        </div>
        <CancelSeriesButton seriesId={series.id} />
      </div>

      <p className="text-xs text-muted">
        Editing an instance directly (from its own page) marks it &quot;edited&quot; and protects it from future series-level
        edits, but not from canceling the whole series.
      </p>

      <ul className="flex flex-col gap-2">
        {instances.map((instance) => (
          <li key={instance.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link href={`/events/${instance.id}`} className="underline">
                {formatDateTime(instance.startsAt, instance.timezone)}
              </Link>
              <span className="text-sm text-muted">
                {instance.status}
                {instance.overridden ? " · edited" : ""}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
