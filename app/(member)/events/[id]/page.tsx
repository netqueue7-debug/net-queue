import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { getEventDetail } from "@/lib/rsvp/event-detail";
import { EventDetailClient } from "./event-detail-client";

// `from` is attacker-controllable (it's a plain query param, editable in
// the address bar or a shared link) and gets rendered straight into an
// <a href>, so it's allowlisted to the two calendar routes that actually
// set it (components/calendar/month-view.tsx and app/(member)/events/
// {day,week}-view.tsx) rather than trusted as-is — anything else (a
// `javascript:` URI, an external origin) is silently dropped, same as
// never having come from a calendar at all.
function sanitizeBackHref(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\/events(\?[^\s]*)?$/.test(raw)) return raw;
  if (/^\/groups\/[a-zA-Z0-9_-]+\/calendar(\?[^\s]*)?$/.test(raw)) return raw;
  return null;
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;
  const sp = await searchParams;
  const detail = await getEventDetail(id, user);
  if (!detail) notFound();

  return (
    <EventDetailClient
      detail={detail}
      viewerRole={detail.viewerRole}
      viewerUserId={user.id}
      eventId={id}
      backHref={sanitizeBackHref(sp.from)}
    />
  );
}
