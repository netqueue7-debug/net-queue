"use client";

import { useState } from "react";
import { LinkIcon, CopyIcon } from "./icons";

// A full-width, tap-anywhere-to-copy strip — deliberately more visually
// prominent than a plain button so this link doesn't get lost among the
// card's other, lower-stakes navigation links. `label` names what the link
// actually is (e.g. "Invite link") since the URL text alone doesn't say so.
// `warning`, when set, still leaves the link copyable (e.g. for later once
// a limit is raised) but flags that using it right now won't work.
export function CopyLinkChip({ label, link, warning }: { label: string; link: string; warning?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted">
        <LinkIcon width={12} height={12} />
        {label}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={`flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-left transition-colors ${
          warning ? "border-warning/40 bg-warning/5 text-warning hover:bg-warning/10" : "border-accent/40 bg-accent/5 text-accent hover:bg-accent/10"
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
          {copied ? (
            "Copied!"
          ) : (
            <>
              <CopyIcon width={13} height={13} />
              Copy
            </>
          )}
        </span>
      </button>
      {warning && <p className="text-xs text-warning">{warning}</p>}
    </div>
  );
}
