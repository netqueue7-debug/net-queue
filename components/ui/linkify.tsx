import type { ReactNode } from "react";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
// Trailing punctuation that's almost always sentence structure, not part
// of the URL (e.g. "check https://example.com." or "(see https://x.com)").
const TRAILING_PUNCTUATION = /[).,!?;:\]]+$/;

// Splits plain text on http(s) URLs and renders those as real links,
// leaving everything else as-is — for free-text fields (group/event
// descriptions) that store plain strings, not markdown or HTML.
export function linkifyText(text: string): ReactNode[] {
  return text.split(URL_REGEX).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;

    const trailingMatch = part.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? part.slice(0, -trailing.length) : part;
    if (!url) return part;

    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noreferrer" className="text-accent underline">
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

export function Linkify({ text }: { text: string }) {
  return <>{linkifyText(text)}</>;
}
