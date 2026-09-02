"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { InAppNotification } from "@/lib/notifications/notifications";
import { formatDateTime } from "@/lib/format-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function describe(n: InAppNotification): string {
  const payload = n.payload as Record<string, unknown>;
  switch (n.type) {
    case "guest_approved":
      return `${payload.guestName ?? "Your guest"} was approved.`;
    case "guest_rejected":
      return `${payload.guestName ?? "Your guest"} was not approved.`;
    case "group_membership_approved":
      return `You were approved to join ${payload.groupName ?? "a group"}.`;
    case "group_membership_rejected":
      return `Your request to join ${payload.groupName ?? "a group"} was not approved.`;
    case "capacity_changed":
      return `Capacity for ${payload.eventTitle} changed from ${payload.from ?? "unlimited"} to ${payload.to ?? "unlimited"}.`;
    case "waiver_reminder":
      return `Reminder: sign the waiver for ${payload.eventTitle} before it starts.`;
    case "location_reveal":
      return `Location revealed for ${payload.eventTitle}.`;
    case "day_before_reminder":
      return `Reminder: ${payload.eventTitle} is tomorrow.`;
    case "event_comment_posted": {
      const text = String(payload.commentBody ?? "");
      const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      return `New update on ${payload.eventTitle}: "${preview}"`;
    }
    default:
      return String(payload.message ?? n.type);
  }
}

export function NotificationItem({ notification }: { notification: InAppNotification }) {
  const router = useRouter();
  const unread = !notification.readAt;
  // Only the approved case is actually reachable — a rejected membership
  // 404s on the group's pages (resolveGroupMembership requires `active`).
  const payload = notification.payload as Record<string, unknown>;
  const groupHref = notification.type === "group_membership_approved" ? `/groups/${payload.groupId}/calendar` : null;

  async function handleMarkRead() {
    await fetch(`/api/notifications/${notification.id}/read`, { method: "POST" });
    router.refresh();
  }

  const body = (
    <div className="flex items-center justify-between gap-3">
      <span className={unread ? "font-medium" : "text-muted"}>{describe(notification)}</span>
      {unread && (
        <Button variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={handleMarkRead}>
          Mark read
        </Button>
      )}
    </div>
  );

  return (
    <li>
      <Card className="p-3">
        {notification.eventId ? (
          <Link href={`/events/${notification.eventId}`} className="block">
            {body}
          </Link>
        ) : groupHref ? (
          <Link href={groupHref} className="block">
            {body}
          </Link>
        ) : (
          body
        )}
        <p className="mt-1 text-xs text-muted">{formatDateTime(notification.createdAt)}</p>
      </Card>
    </li>
  );
}
