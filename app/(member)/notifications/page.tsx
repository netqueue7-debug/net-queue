import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { listNotificationsForUser } from "@/lib/notifications/notifications";
import { NotificationItem } from "./notification-item";
import { MarkAllReadButton } from "./mark-all-read-button";
import { ClearNotificationsButton } from "./clear-notifications-button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function NotificationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (needsOnboarding(user)) redirect("/onboarding");

  const notifications = await listNotificationsForUser(user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <div className="flex items-center gap-3">
          {notifications.some((n) => !n.readAt) && <MarkAllReadButton />}
          {notifications.length > 0 && <ClearNotificationsButton />}
        </div>
      </div>

      {notifications.length === 0 && <EmptyState>Nothing yet.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {notifications.map((n) => (
          <NotificationItem key={n.id} notification={n} />
        ))}
      </ul>
    </main>
  );
}
