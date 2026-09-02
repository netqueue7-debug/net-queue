"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { CreateEventForm } from "@/app/admin/events/create-event-form";
import { CreateSeriesForm } from "@/app/admin/groups/[id]/series/create-series-form";

type Mode = "one-off" | "series";

function CreateEventDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("one-off");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Create event</h2>
          <Button type="button" variant="secondary" className="px-2.5 py-1 text-sm" onClick={onClose}>
            Cancel
          </Button>
        </div>

        <div className="flex w-fit gap-1 rounded-full border border-border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("one-off")}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              mode === "one-off" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            One-off
          </button>
          <button
            type="button"
            onClick={() => setMode("series")}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              mode === "series" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Recurring series
          </button>
        </div>

        {mode === "one-off" ? (
          <CreateEventForm groupId={groupId} onSuccess={onClose} />
        ) : (
          <CreateSeriesForm groupId={groupId} onSuccess={onClose} />
        )}
      </div>
    </div>
  );
}

export function CreateEventToggle({ groupId, defaultOpen = false }: { groupId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <Button type="button" variant="secondary" className="w-fit gap-1.5 px-2.5 py-1.5 text-sm" onClick={() => setOpen(true)}>
        <PlusIcon width={15} height={15} />
        Create Event
      </Button>
      {open && <CreateEventDialog groupId={groupId} onClose={() => setOpen(false)} />}
    </>
  );
}
