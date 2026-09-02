// Minimal RFC 5545 (iCalendar) generation for a single VEVENT — no library,
// hand-rolled since the app only needs a one-off "Add to Calendar" export,
// not a general-purpose calendar toolkit. Readable by Apple Calendar,
// Google Calendar, and Outlook.

const CRLF = "\r\n";

// TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, and
// newline are the only characters that need escaping for our fields.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatDateTimeUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;
}

// RFC 5545 §3.1 line folding: a content line must not exceed 75 octets;
// continuation lines start with a single space. Fine to fold on character
// count here (event titles/locations are plain ASCII/Latin text in
// practice), not true UTF-8 octet count.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }
  parts.push(rest);
  return parts.join(CRLF + " ");
}

export interface IcsEventInput {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  description?: string | null;
  location?: string | null;
}

export function buildIcsEvent(input: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NetQueue//Event//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@netqueue`,
    `DTSTAMP:${formatDateTimeUtc(new Date())}`,
    `DTSTART:${formatDateTimeUtc(input.startsAt)}`,
    `DTEND:${formatDateTimeUtc(input.endsAt)}`,
    `SUMMARY:${escapeText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join(CRLF) + CRLF;
}
