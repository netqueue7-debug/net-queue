import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { User } from "@/lib/generated/prisma/client";

export const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("You don't have permission to do that.");
    this.name = "ForbiddenError";
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Returns the raw token — callers are responsible for setting it on the
// response cookie (see `setSessionCookie`). Only the hash is persisted.
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

async function resolveUserFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || session.user.bannedAt) {
    return null;
  }

  return session.user;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

// Server Component usage (no NextRequest available): falls back to
// `next/headers`. Only works inside real Next.js request handling —
// calling a route handler directly (e.g. in a test) must pass `request`.
async function readCookieFallback(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function getSession(request?: NextRequest): Promise<User | null> {
  const token = request ? request.cookies.get(SESSION_COOKIE_NAME)?.value : await readCookieFallback();
  return resolveUserFromToken(token);
}

export async function requireMember(request?: NextRequest): Promise<User> {
  const user = await getSession(request);
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(request?: NextRequest): Promise<User> {
  const user = await requireMember(request);
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}
