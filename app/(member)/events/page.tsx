import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { listEventsForMember } from "@/lib/rsvp/event-detail";

export default async function EventsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const items = await listEventsForMember(user);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Upcoming Events</h1>

      {items.length === 0 && <p className="text-zinc-600 dark:text-zinc-400">No upcoming events.</p>}

      <ul className="flex flex-col gap-3">
        {items.map(({ event, seatsRemaining, yourStatus }) => (
          <li key={event.id} className="rounded border border-zinc-300 p-4 dark:border-zinc-700">
            <Link href={`/events/${event.id}`} className="font-medium underline">
              {event.title}
            </Link>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{new Date(event.startsAt).toLocaleString()}</p>
            <p className="text-sm">
              {seatsRemaining === null ? "Unlimited seats" : seatsRemaining > 0 ? `${seatsRemaining} seats left` : "Waitlist only"}
              {yourStatus && ` — You: ${yourStatus}`}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
