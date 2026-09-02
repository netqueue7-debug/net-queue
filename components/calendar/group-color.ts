// Assigns each group a stable color from the app's existing semantic tone
// set (Badge's tones — no new palette to keep in sync with light/dark
// mode). Not meaningful by tone (a group being "danger"-colored implies
// nothing bad) — purely a rotating, deterministic way to tell "which
// group is this" apart across the month grid's small chips, the same
// problem Google Calendar solves with per-calendar colors.
const TONES = ["accent", "success", "warning", "info", "danger"] as const;
export type GroupColorTone = (typeof TONES)[number];

export const GROUP_CHIP_CLASS: Record<GroupColorTone, string> = {
  accent: "bg-accent/10 text-accent hover:bg-accent/20",
  success: "bg-success/10 text-success hover:bg-success/20",
  warning: "bg-warning/10 text-warning hover:bg-warning/20",
  info: "bg-info/10 text-info hover:bg-info/20",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
};

export const GROUP_DOT_CLASS: Record<GroupColorTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
};

// Deterministic (same id -> same tone always), not cryptographic — just
// stable bucketing into the small fixed palette above.
export function groupColorTone(groupId: string): GroupColorTone {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
