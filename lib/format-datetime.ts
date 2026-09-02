// Shared view-layer datetime formatting. Every place in the app that
// renders a date+time to a viewer should go through this so "8:00 AM" (no
// seconds) stays consistent everywhere, instead of each callsite repeating
// its own toLocaleString options (and some including seconds, some not).
// Works identically in server components (Node's Intl, server locale) and
// client components (browser's Intl, viewer's locale) — same runtime
// behavior as the bare `toLocaleString()` calls this replaces.
export function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Time-only, for contexts where the date is already shown elsewhere (a
// calendar day header, a date chip) and repeating it would be redundant.
export function formatTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
