import { NextRequest, NextResponse } from "next/server";
import { requireMember, ForbiddenError, UnauthorizedError } from "@/lib/auth/session";
import { assertGroupAdmin } from "@/lib/groups/authz";
import { uploadGroupImage, removeGroupImage, InvalidGroupImageError, GroupImageUploadFailedError } from "@/lib/groups/image";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertGroupAdmin(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const url = await uploadGroupImage(id, file);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof InvalidGroupImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof GroupImageUploadFailedError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  try {
    await assertGroupAdmin(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await removeGroupImage(id);
  return NextResponse.json({ ok: true });
}
