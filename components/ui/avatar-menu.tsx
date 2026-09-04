"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { SettingsIcon, AlertIcon, LogoutIcon } from "./icons";

const menuItemClass = "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/8";

export function AvatarMenu({ avatarUrl, initial }: { avatarUrl: string | null; initial: string }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Screen coordinates for the portaled panel, recomputed each time the
  // menu opens — null until then, so nothing renders before it's known.
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // nav is `sticky top-0`, so the button's viewport position doesn't
    // move on page scroll — a one-time measurement here is enough, no
    // scroll listener needed to keep it pinned to the button.
    setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // A resize could stale the one-time position measurement — closing
    // is simpler and safer than tracking it live for a rare edge case.
    function onResize() {
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // Hard navigation, not router.push + router.refresh — the session
    // cookie is cleared by a Route Handler, not a Server Action, so Next
    // won't auto-invalidate the client router cache for the shared Nav.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional, see comment above
    window.location.href = "/login";
  }

  return (
    <div className="ml-1 flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent/10 text-sm font-semibold text-accent ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-accent/40"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not worth an Image remotePatterns entry
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, right: position.right }}
            className="fixed z-50 w-40 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
          >
            <Link href="/settings" role="menuitem" className={menuItemClass} onClick={() => setOpen(false)}>
              <SettingsIcon width={16} height={16} />
              Settings
            </Link>
            <Link href="/feedback" role="menuitem" className={menuItemClass} onClick={() => setOpen(false)}>
              <AlertIcon width={16} height={16} />
              Feedback
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={loggingOut}
              className={`${menuItemClass} w-full disabled:opacity-50`}
            >
              <LogoutIcon width={16} height={16} />
              {loggingOut ? "Logging out…" : "Log Out"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
