import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { updateSeriesSchema } from "@/lib/events/series-schema";
import { cancelSeries, getSeries, updateSeries } from "@/lib/events/series";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const series = await getSeries(id);
  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });

  try {
    await assertGroupAdmin(series.groupId, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  return NextResponse.json({ series });
}

// Propagates onto future, non-overridden instances — see
// lib/events/series.ts#updateSeries for exactly what that means.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const parsed = updateSeriesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body.", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await getSeries(id);
  if (!existing) return NextResponse.json({ error: "Series not found." }, { status: 404 });

  try {
    await assertGroupAdmin(existing.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { series, updatedCount } = await updateSeries(id, parsed.data, admin.id);
  return NextResponse.json({ series, updatedCount });
}

// Cancels every future instance (overridden or not) — see
// lib/events/series.ts#cancelSeries.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let admin;
  try {
    admin = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const existing = await getSeries(id);
  if (!existing) return NextResponse.json({ error: "Series not found." }, { status: 404 });

  try {
    await assertGroupAdmin(existing.groupId, admin.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { canceledCount } = await cancelSeries(id, admin.id);
  return NextResponse.json({ canceledCount });
}
