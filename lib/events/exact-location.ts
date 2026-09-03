// A loose, dependency-free "looks like a real address" check — not a
// verified/geocoded address (that would need a paid Google API + a new
// dependency, deliberately out of scope here per the plan discussion).
// Just enough to reject blank/placeholder text like "TBD" or "the gym" and
// require something shaped like "123 Main St, Springfield" before an event
// can be posted.
const MIN_LENGTH = 5;
const STARTS_WITH_STREET_NUMBER = /^\d+\s/;

export function looksLikeAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_LENGTH && STARTS_WITH_STREET_NUMBER.test(trimmed);
}

export const EXACT_LOCATION_HINT = 'Enter a full street address starting with the number (e.g. "123 Main St, Springfield").';
