import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, UnauthorizedError } from "@/lib/auth/session";
import { WAIVER_VERSION } from "@/lib/waivers/content";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  waiverAccepted: z.literal(true),
});

function getClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { displayName } = parsed.data;
  const ip = getClientIp(request);
  const signedAt = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { displayName, waiverAcceptedAt: signedAt, waiverVersion: WAIVER_VERSION },
    }),
    prisma.waiverSignature.create({
      data: { waiverVersion: WAIVER_VERSION, signerType: "user", userId: user.id, ip, signedAt },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
