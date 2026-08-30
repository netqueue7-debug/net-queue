"use client";

import { useRouter } from "next/navigation";
import { EventForm, type EventFormBody } from "./event-form";

export function CreateEventForm() {
  const router = useRouter();

  async function handleSubmit(body: EventFormBody) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error ?? "Failed to create event." };
    }
    router.refresh();
    return { ok: true };
  }

  return <EventForm submitLabel="Create event" onSubmit={handleSubmit} resetOnSuccess />;
}
