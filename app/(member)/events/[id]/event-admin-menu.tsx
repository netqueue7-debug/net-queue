"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SerializedEvent } from "@/lib/serializers/event";
import { EventForm, type EventFormBody, type EventFormInitialValues } from "@/app/admin/events/event-form";
import { SeriesEditForm, type SeriesEditFormBody, type SeriesEditFormInitialValues } from "@/app/admin/events/series-edit-form";
import { Modal } from "@/components/ui/modal";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorText, HelperText } from "@/components/ui/text";
import { LogIcon, PencilIcon, TrashIcon, ShieldIcon } from "@/components/ui/icons";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventFormInitialValues(event: SerializedEvent): EventFormInitialValues {
  return {
    title: event.title,
    description: event.description ?? "",
    startsAt: toDatetimeLocal(event.startsAt),
    endsAt: toDatetimeLocal(event.endsAt),
    signupOpensAt: toDatetimeLocal(event.signupOpensAt),
    timezone: event.timezone,
    capacity: event.capacity?.toString() ?? "",
    maxGuestsPerRsvp: event.maxGuestsPerRsvp?.toString() ?? "",
    waiverRequired: event.waiverRequired,
    generalLocation: event.generalLocation ?? "",
    exactLocation: event.exactLocation ?? "",
    googleMapsUrl: event.googleMapsUrl ?? "",
    appleMapsUrl: event.appleMapsUrl ?? "",
    locationRevealPolicy: event.locationRevealPolicy,
    locationRevealHours: event.locationRevealHours?.toString() ?? "",
  };
}

// One consolidated "Manage" dropdown for every admin action on an event
// page — replaces what used to be three separate stacked rows (single-
// event buttons, a per-weekday-cancel row, an inline edit form) with one
// menu that opens a modal or confirm dialog per action. Series-wide edit
// deliberately has no "just this weekday" option (unlike cancel) — an
// admin who needs different content on different weekdays cancels the
// series and creates a new one, rather than this UI trying to reconcile a
// partial edit across a recurring pattern.
export function EventAdminMenu({
  eventId,
  event,
  series,
}: {
  eventId: string;
  event: SerializedEvent;
  series: { id: string; weekdays: number[] } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingEvent, setEditingEvent] = useState(false);

  const [editingSeries, setEditingSeries] = useState(false);
  const [seriesEditValues, setSeriesEditValues] = useState<SeriesEditFormInitialValues | null>(null);
  const [seriesEditLoading, setSeriesEditLoading] = useState(false);

  const [confirmingCancelEvent, setConfirmingCancelEvent] = useState(false);
  const [confirmingWeekday, setConfirmingWeekday] = useState<number | null>(null);
  const [confirmingCancelSeries, setConfirmingCancelSeries] = useState(false);

  async function handleEditEventSubmit(body: EventFormBody) {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error ?? "Failed to save changes." };
    }
    router.refresh();
    return { ok: true };
  }

  async function handleOpenEditSeries() {
    if (!series) return;
    setError(null);
    setSeriesEditLoading(true);
    try {
      const res = await fetch(`/api/event-series/${series.id}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Failed to load series.");
        return;
      }
      const { series: s } = await res.json();
      setSeriesEditValues({
        title: s.title,
        description: s.description ?? "",
        capacity: s.capacity?.toString() ?? "",
        maxGuestsPerRsvp: s.maxGuestsPerRsvp?.toString() ?? "",
        waiverRequired: s.waiverRequired,
        generalLocation: s.generalLocation ?? "",
        exactLocation: s.exactLocation ?? "",
        googleMapsUrl: s.googleMapsUrl ?? "",
        appleMapsUrl: s.appleMapsUrl ?? "",
        locationRevealPolicy: s.locationRevealPolicy,
        locationRevealHours: s.locationRevealHours?.toString() ?? "",
      });
      setEditingSeries(true);
    } finally {
      setSeriesEditLoading(false);
    }
  }

  async function handleEditSeriesSubmit(body: SeriesEditFormBody) {
    if (!series) return { ok: false, error: "No series." };
    const res = await fetch(`/api/event-series/${series.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error ?? "Failed to save changes." };
    }
    router.refresh();
    return { ok: true };
  }

  async function cancel(url: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to cancel.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCancelEvent() {
    setConfirmingCancelEvent(false);
    await cancel(`/api/events/${eventId}`);
  }

  async function handleConfirmWeekday() {
    const weekday = confirmingWeekday;
    setConfirmingWeekday(null);
    if (weekday === null || !series) return;
    await cancel(`/api/event-series/${series.id}/weekdays/${weekday}`);
  }

  async function handleConfirmCancelSeries() {
    setConfirmingCancelSeries(false);
    if (!series) return;
    await cancel(`/api/event-series/${series.id}`);
  }

  const items: DropdownMenuItem[] = [
    { key: "edit-event", label: "Edit this event", icon: <PencilIcon width={16} height={16} />, onClick: () => setEditingEvent(true) },
  ];
  if (series) {
    items.push({
      key: "edit-series",
      label: seriesEditLoading ? "Loading series…" : "Edit series",
      icon: <ShieldIcon width={16} height={16} />,
      disabled: seriesEditLoading,
      onClick: handleOpenEditSeries,
    });
  }
  items.push({ key: "view-log", label: "View log", icon: <LogIcon width={16} height={16} />, href: `/events/${eventId}/log` });
  if (event.status !== "canceled") {
    items.push({
      key: "cancel-event",
      label: "Cancel this event",
      icon: <TrashIcon width={16} height={16} />,
      tone: "destructive",
      onClick: () => setConfirmingCancelEvent(true),
    });
  }
  if (series && series.weekdays.length > 1) {
    for (const d of series.weekdays) {
      items.push({
        key: `cancel-weekday-${d}`,
        label: `Cancel all ${WEEKDAY_NAMES[d]}s`,
        icon: <TrashIcon width={16} height={16} />,
        tone: "destructive",
        onClick: () => setConfirmingWeekday(d),
      });
    }
  }
  if (series) {
    items.push({
      key: "cancel-series",
      label: "Cancel remaining series",
      icon: <TrashIcon width={16} height={16} />,
      tone: "destructive",
      onClick: () => setConfirmingCancelSeries(true),
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-5">
      <div>
        <DropdownMenu label="Manage" items={items} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}

      <Modal open={editingEvent} title="Edit this event" onClose={() => setEditingEvent(false)}>
        <EventForm
          submitLabel="Save changes"
          onSubmit={handleEditEventSubmit}
          onSuccess={() => setEditingEvent(false)}
          initialValues={eventFormInitialValues(event)}
        />
      </Modal>

      {series && seriesEditValues && (
        <Modal open={editingSeries} title="Edit series" onClose={() => setEditingSeries(false)}>
          <SeriesEditForm initialValues={seriesEditValues} onSubmit={handleEditSeriesSubmit} onSuccess={() => setEditingSeries(false)} />
        </Modal>
      )}

      <ConfirmDialog
        open={confirmingCancelEvent}
        title="Cancel this event?"
        description="This does not delete it, but members will see it as canceled."
        confirmLabel="Cancel event"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirmCancelEvent}
        onCancel={() => setConfirmingCancelEvent(false)}
      />

      <ConfirmDialog
        open={confirmingWeekday !== null}
        title={confirmingWeekday !== null ? `Cancel all ${WEEKDAY_NAMES[confirmingWeekday]}s?` : ""}
        description={
          confirmingWeekday !== null
            ? `Every remaining ${WEEKDAY_NAMES[confirmingWeekday]} instance of this series will be canceled. Other weekdays in this series, and past instances, are left alone.`
            : ""
        }
        confirmLabel="Cancel this weekday"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirmWeekday}
        onCancel={() => setConfirmingWeekday(null)}
      />

      <ConfirmDialog
        open={confirmingCancelSeries}
        title="Cancel remaining series?"
        description="Every remaining instance of this series will be canceled. Past instances are left alone."
        confirmLabel="Cancel series"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirmCancelSeries}
        onCancel={() => setConfirmingCancelSeries(false)}
      />

      {event.overridden && (
        <HelperText>This occurrence was edited individually, so &quot;Edit series&quot; changes skip it.</HelperText>
      )}
    </div>
  );
}
