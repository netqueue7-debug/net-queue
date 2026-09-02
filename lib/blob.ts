import { del } from "@vercel/blob";

// Best-effort cleanup of a replaced/removed blob — never allowed to block
// or fail the caller's own update (e.g. the file's already gone, or the
// token hiccups). Orphaning a blob is cheap; blocking an edit on storage
// cleanup isn't worth it. Shared by every feature that replaces an image
// (lib/settings/avatar.ts, lib/groups/image.ts).
export function deleteBlobBestEffort(url: string): void {
  void del(url).catch(() => {});
}
