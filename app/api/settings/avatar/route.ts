import { NextRequest, NextResponse } from "next/server";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { uploadAvatar, removeAvatar, InvalidAvatarError, AvatarUploadFailedError } from "@/lib/settings/avatar";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const url = await uploadAvatar(user.id, file);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof InvalidAvatarError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof AvatarUploadFailedError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}

export async function DELETE(request: NextRequest) {
  let user;
  try {
    user = await requireMember(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  await removeAvatar(user.id);
  return NextResponse.json({ ok: true });
}
