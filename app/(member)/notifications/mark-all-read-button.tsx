"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const router = useRouter();

  async function handleClick() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    router.refresh();
  }

  return (
    <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={handleClick}>
      Mark all read
    </Button>
  );
}
