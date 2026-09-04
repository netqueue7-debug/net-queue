import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { cancelSeriesWeekday, getSeries } from "@/lib/events/series";

type RouteContext = { params: Promise<{ id: string; weekday: string }> };

// Cancels every future instance of the series that falls on `weekday`
// (0=Sun..6=Sat) — see lib/events/series.ts#cancelSeriesWeekday. Leaves
// other weekdays of the same series untouched.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id, weekday: weekdayParam } = await params;
  const weekday = Number(weekdayParam);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: "weekday must be an integer 0-6 (0=Sun..6=Sat)." }, { status: 400 });
  }

  const existing = await getSeries(id);
  if (!existing) return NextResponse.json({ error: "Series not found." }, { status: 404 });

  try {
    await assertGroupAdmin(existing.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { canceledCount } = await cancelSeriesWeekday(id, weekday, admin.id);
  return NextResponse.json({ canceledCount });
}
