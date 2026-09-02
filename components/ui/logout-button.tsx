"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" className="flex-shrink-0 px-3 py-1.5" onClick={handleLogout} loading={loading}>
      Log out
    </Button>
  );
}
