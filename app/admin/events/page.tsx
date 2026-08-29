import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listEvents } from "@/lib/events/events";
import { CreateEventForm } from "./create-event-form";

export default async function AdminEventsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/home");

  const events = await listEvents();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Admin: Events</h1>

      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id} className="rounded border border-zinc-300 p-3 dark:border-zinc-700">
            <Link href={`/events/${event.id}`} className="font-medium underline">
              {event.title}
            </Link>
            <span className="ml-2 text-sm text-zinc-500">({event.status})</span>
          </li>
        ))}
      </ul>

      <h2 className="text-lg font-medium">Create event</h2>
      <CreateEventForm />
    </main>
  );
}
