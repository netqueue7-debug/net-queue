// Curated US timezone options for event/series forms — deliberately just
// the common America/* zones rather than the full ~30-entry IANA "America"
// region (most of which are Latin America), per product direction to keep
// this US-only for now.
export const US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Phoenix", label: "Mountain, no DST — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
];
