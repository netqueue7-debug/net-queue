import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/auth/onboarding";
import { countUnreadNotifications } from "@/lib/notifications/notifications";
import { getDefaultAdminGroupId } from "@/lib/groups/authz";
import { getPendingMembershipCountForAdmin } from "@/lib/groups/groups";
import { CalendarIcon, UsersIcon, BellIcon, ShieldIcon } from "./icons";
import { AvatarMenu } from "./avatar-menu";

const linkClass =
  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-accent/8 hover:text-foreground";

export async function Nav() {
  const user = await getSession();
  if (!user || needsOnboarding(user)) return null;

  const isPlatformAdmin = user.role === "admin";
  const [unreadCount, adminGroupId] = await Promise.all([countUnreadNotifications(user.id), getDefaultAdminGroupId(user.id)]);
  const showAdmin = isPlatformAdmin || adminGroupId !== null;
  // Only worth the extra query when the Admin link is actually showing.
  const pendingMembershipCount = showAdmin ? await getPendingMembershipCountForAdmin(user.id, isPlatformAdmin) : 0;
  const initial = (user.displayName ?? "?").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 overflow-x-auto px-4 py-2.5 sm:px-6">
        <Link href="/home" className="flex flex-shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">N</span>
          <span className="hidden sm:inline">NetQueue</span>
        </Link>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Link href="/events" className={linkClass}>
            <CalendarIcon width={16} height={16} />
            <span className="hidden sm:inline">Events</span>
          </Link>
          <Link href="/groups" className={linkClass}>
            <UsersIcon width={16} height={16} />
            <span className="hidden sm:inline">Groups</span>
          </Link>
          <Link href="/notifications" className={`${linkClass} relative`}>
            <BellIcon width={16} height={16} />
            <span className="hidden sm:inline">Notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white sm:static sm:ml-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          {showAdmin && (
            <Link href="/admin" className={`${linkClass} relative`}>
              <ShieldIcon width={16} height={16} />
              <span className="hidden sm:inline">Admin</span>
              {pendingMembershipCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white sm:static sm:ml-0.5">
                  {pendingMembershipCount > 9 ? "9+" : pendingMembershipCount}
                </span>
              )}
            </Link>
          )}
          <AvatarMenu avatarUrl={user.avatarUrl} initial={initial} />
        </div>
      </nav>
    </header>
  );
}
