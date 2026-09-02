"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorText } from "@/components/ui/text";
import { TrashIcon } from "@/components/ui/icons";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Series-level cancel actions, surfaced right on an instance's own event
// page (reached via any calendar chip for that series) rather than a
// separate series page — the calendar already shows every instance, so a
// dedicated instance-list page added nothing. Single-instance cancel is
// the existing "Cancel event" button next to these; this component only
// adds the two series-wide options: drop one weekday, or cancel the rest
// of the series outright (lib/events/series.ts#cancelSeriesWeekday /
// #cancelSeries).
export function SeriesActions({ seriesId, weekdays }: { seriesId: string; weekdays: number[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWeekday, setConfirmingWeekday] = useState<number | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

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

  async function handleConfirmWeekday() {
    const weekday = confirmingWeekday;
    setConfirmingWeekday(null);
    if (weekday === null) return;
    await cancel(`/api/event-series/${seriesId}/weekdays/${weekday}`);
  }

  async function handleConfirmAll() {
    setConfirmingAll(false);
    await cancel(`/api/event-series/${seriesId}`);
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {weekdays.length > 1 &&
          weekdays.map((d) => (
            <Button
              key={d}
              variant="destructive-link"
              className="text-sm"
              disabled={loading}
              onClick={() => setConfirmingWeekday(d)}
            >
              Cancel all {WEEKDAY_NAMES[d]}s
            </Button>
          ))}
        <Button
          variant="destructive"
          className="gap-1.5 px-2.5 py-1.5 text-sm"
          disabled={loading}
          onClick={() => setConfirmingAll(true)}
        >
          <TrashIcon width={16} height={16} />
          Cancel remaining series
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}

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
        open={confirmingAll}
        title="Cancel remaining series?"
        description="Every remaining instance of this series will be canceled. Past instances are left alone."
        confirmLabel="Cancel series"
        cancelLabel="Never mind"
        loading={loading}
        onConfirm={handleConfirmAll}
        onCancel={() => setConfirmingAll(false)}
      />
    </div>
  );
}
