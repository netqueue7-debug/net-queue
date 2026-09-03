"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

// Generic content modal — same overlay/Escape-to-close mechanics as
// ConfirmDialog, but for arbitrary children (a form) instead of a fixed
// confirm/cancel button pair. No click-outside-to-close: a form mid-edit
// shouldn't be discardable by a stray backdrop click.
export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Always `items-start`, never `items-center` — centering a flex item
  // taller than its scrollable container clips the portion that overflows
  // *above* the centered position in a way `overflow-y-auto` can't reach
  // (a well-known flexbox pitfall). Anchoring to the top instead means the
  // header/close button always render at scroll position 0, and the rest
  // of a tall form scrolls into view normally.
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className={`my-8 w-full ${maxWidthClassName} rounded-lg border border-border bg-background p-5 shadow-lg`}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted transition-colors hover:bg-accent/8 hover:text-foreground"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
