import type { FocusEvent } from "react";

// Plain search-link URLs built from address text — no geocoding API, no
// dependency, no API key. These are "search for this text" links, not a
// verified pinpoint: usually correct for a real street address, but can
// land on an ambiguous result for a vague one. Used to auto-fill the
// Google/Apple Maps link fields once an admin has typed an exact location
// (app/admin/events/event-form.tsx and series-edit-form.tsx), never to
// override a link they've already customized.
export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function appleMapsSearchUrl(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}

// Blur handler for an "exact location" text input, shared by every form
// that has this field + the two map link fields alongside it
// (event-form.tsx, series-edit-form.tsx, create-series-form.tsx). Only
// fills a map link field when it's still blank — an admin's own edit to
// either link always wins, this just speeds up the common case of leaving
// them for the app to derive. Reads/writes plain form elements (not React
// state/refs) since these are uncontrolled forms, submitted via FormData.
export function autofillMapsLinksOnBlur(e: FocusEvent<HTMLInputElement>) {
  const address = e.currentTarget.value.trim();
  if (!address) return;
  const form = e.currentTarget.form;
  if (!form) return;
  const google = form.elements.namedItem("googleMapsUrl") as HTMLInputElement | null;
  const apple = form.elements.namedItem("appleMapsUrl") as HTMLInputElement | null;
  if (google && !google.value.trim()) google.value = googleMapsSearchUrl(address);
  if (apple && !apple.value.trim()) apple.value = appleMapsSearchUrl(address);
}
