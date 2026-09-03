"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
  disabled?: boolean;
  // Exactly one of these — `href` renders a real `<Link>` (so ctrl/cmd-click
  // and "open in new tab" keep working, e.g. "View log"), `onClick` renders
  // a `<button>` that opens a modal/dialog in the parent.
  href?: string;
  onClick?: () => void;
}

const itemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/8 disabled:opacity-50 disabled:pointer-events-none";

// Same portal/position/outside-click/Escape mechanics as AvatarMenu
// (components/ui/avatar-menu.tsx), generalized to an arbitrary action list
// instead of the two hardcoded Settings/Log Out items — the pattern this
// event page's admin actions (edit event, edit series, view log, cancel
// event, cancel weekday, cancel series) needed a home for.
interface MenuPosition {
  left: number;
  // Exactly one of these is set — `top` anchors below the trigger,
  // `bottom` anchors above it (see openMenu below).
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export function DropdownMenu({ label, icon, items }: { label: string; icon?: React.ReactNode; items: DropdownMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Opens downward (the common case) unless there's markedly more room
  // above the trigger than below — e.g. this menu sitting near the bottom
  // of a long event page, which is exactly what was going off-screen
  // before this fix. `maxHeight` + `overflow-y-auto` on the panel is a
  // safety net for the rare case neither direction fits every item.
  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    setPosition(
      openUpward
        ? { left: rect.left, bottom: window.innerHeight - rect.top + margin, maxHeight: spaceAbove }
        : { left: rect.left, top: rect.bottom + margin, maxHeight: spaceBelow },
    );
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

  function handleItemClick(item: DropdownMenuItem) {
    setOpen(false);
    item.onClick?.();
  }

  return (
    <div className="inline-block flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:border-accent/40 hover:bg-accent/5"
      >
        {icon}
        {label}
        <ChevronDownIcon width={14} height={14} />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              left: position.left,
              ...(position.top !== undefined ? { top: position.top } : { bottom: position.bottom }),
              maxHeight: position.maxHeight,
            }}
            className="fixed z-50 w-56 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
          >
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.key}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`${itemClass} ${item.tone === "destructive" ? "text-danger" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => handleItemClick(item)}
                  className={`${itemClass} ${item.tone === "destructive" ? "text-danger" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
