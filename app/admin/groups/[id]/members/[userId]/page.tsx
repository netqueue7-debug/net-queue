import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { resolveGroupMembership } from "@/lib/groups/authz";
import { getMemberAttendanceInGroup } from "@/lib/admin/attendance";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default async function MemberAttendancePage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const { id, userId } = await params;
  const membership = await resolveGroupMembership(id, user.id);
  if (!membership || membership.role !== "admin") notFound();

  const member = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, phone: true } });
  if (!member) notFound();

  const attendance = await getMemberAttendanceInGroup(id, userId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">{member.displayName ?? member.phone}</h1>

      {attendance.length === 0 && <EmptyState>No RSVP history in this group.</EmptyState>}

      <ul className="flex flex-col gap-2">
        {attendance.map((row) => (
          <li key={row.eventId}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>{row.eventTitle}</span>
              <span className="text-sm text-muted">
                {new Date(row.startsAt).toLocaleDateString()} · {row.status}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
