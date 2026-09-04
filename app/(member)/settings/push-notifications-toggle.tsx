"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/ui/text";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type Status = "checking" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function PushNotificationsToggle() {
  // Always starts as "checking" on both server and the client's first
  // render — browser feature/permission checks can't run during SSR, and
  // computing them eagerly (e.g. in a lazy useState initializer) makes the
  // client's first render disagree with the server's, which is a hydration
  // error, not just a lint nit. Real detection only happens post-mount.
  const [status, setStatus] = useState<Status>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser-capability check, must run post-mount to avoid a hydration mismatch
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    (async () => {
      const registration = await navigator.serviceWorker.register(new URL("../../../lib/service-worker.js", import.meta.url), {
        scope: "/",
        updateViaCache: "none",
      });
      const sub = await registration.pushManager.getSubscription();
      setSubscription(sub);
      setStatus(sub ? "subscribed" : "unsubscribed");
    })();
  }, []);

  async function subscribe() {
    setError(null);
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "") as BufferSource,
      });
      const serialized = JSON.parse(JSON.stringify(sub));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to subscribe.");
        return;
      }
      setSubscription(sub);
      setStatus("subscribed");
    } catch {
      setError("Failed to subscribe. Check your browser's notification permission.");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!subscription) return;
    setError(null);
    setLoading(true);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setSubscription(null);
      setStatus("unsubscribed");
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") return null;
  if (status === "unsupported") return <p className="text-sm text-muted">Push notifications aren&apos;t supported in this browser.</p>;
  if (status === "denied") {
    return <p className="text-sm text-muted">Notifications are blocked for this site — enable them in your browser settings to turn this on.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {status === "subscribed"
          ? "You'll get a browser notification whenever you get an in-app notification."
          : "Get a browser notification whenever you get an in-app notification."}
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      {status === "subscribed" ? (
        <Button type="button" variant="secondary" loading={loading} onClick={unsubscribe}>
          Turn off
        </Button>
      ) : (
        <Button type="button" loading={loading} onClick={subscribe}>
          Turn on
        </Button>
      )}
    </div>
  );
}
