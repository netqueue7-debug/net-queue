import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { getEventDetail } from "@/lib/rsvp/event-detail";
import { EventDetailClient } from "./event-detail-client";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const { id } = await params;
  const detail = await getEventDetail(id, user);
  if (!detail) notFound();

  return <EventDetailClient detail={detail} viewerRole={detail.viewerRole} viewerUserId={user.id} eventId={id} />;
}
