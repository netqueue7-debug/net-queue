import { prisma } from "@/lib/db";
import { sendSms, SmsSendError } from "./sms";
import type { Notification, NotificationType, NotificationChannel, Prisma } from "@/lib/generated/prisma/client";

// The SMS "moments that matter" — kept short to control Twilio cost
// (architecture.md#notifications). Every other type is in-app only.
const SMS_TYPES = new Set<NotificationType>(["rsvp_promoted", "rsvp_demoted", "event_canceled", "event_updated"]);

const MAX_ATTEMPTS = 5;

export interface EnqueueInput {
  userId: string;
  eventId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
}

// Enqueue inside the caller's transaction (e.g. withEventLock's callback) —
// for `sms`, actual sending is dispatched only after commit, never inside
// it (architecture.md's "Promotion SMS must be idempotent and best-effort
// — a failed send never rolls back the queue mutation," satisfied by
// construction: dispatch runs entirely outside the transaction that
// created this row). `in_app` types have no external delivery step at all
// — the row *is* the notification — so they're stamped `sent` immediately
// and callers never need to dispatch them.
//
// Deliberately no dedupe check here for SMS/most types — a second
// occurrence of the same (user, event, type) over time (re-promoted after
// a cancel/resignup, a second guest approved for the same host) is a real,
// distinct event and deserves its own row. Cron-driven types dedupe
// themselves before calling this — see lib/notifications/jobs.ts.
export function enqueueNotification(tx: Prisma.TransactionClient, input: EnqueueInput): Promise<Notification> {
  const channel: NotificationChannel = SMS_TYPES.has(input.type) ? "sms" : "in_app";
  return tx.notification.create({
    data: {
      userId: input.userId,
      eventId: input.eventId,
      type: input.type,
      channel,
      payload: input.payload as Prisma.InputJsonValue,
      ...(channel === "in_app" ? { status: "sent" as const, sentAt: new Date() } : {}),
    },
  });
}

function formatLocal(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSmsBody(type: NotificationType, payload: any): string {
  const when = payload.startsAt && payload.timezone ? formatLocal(payload.startsAt, payload.timezone) : "";
  switch (type) {
    case "rsvp_promoted":
      return `You're in for ${payload.eventTitle} (${when}).`;
    case "rsvp_demoted":
      return `You've been moved to the waitlist for ${payload.eventTitle} (${when}) — sorry about that.`;
    case "event_canceled":
      return `${payload.eventTitle} (${when}) has been canceled.`;
    case "event_updated": {
      // Never repeats the new address here — exactLocation is still
      // subject to its own reveal-timing gate (architecture.md#location-
      // gating), and an SMS body must not become a side channel around it.
      const bits: string[] = [];
      if (payload.timeChanged) bits.push(`new time ${when}`);
      if (payload.locationChanged) bits.push("location changed");
      return `${payload.eventTitle} updated (${bits.join(", ")}) — check the app for details.`;
    }
    default:
      return String(payload.message ?? "");
  }
}

// Best-effort, after-commit dispatch for one already-created row. Never
// throws — a send failure is recorded on the row (attempts, lastError,
// status back to `pending` for a later retry sweep, or `failed` once
// MAX_ATTEMPTS is exhausted) rather than propagated, so a caller can
// fire-and-forget this right after a transaction commits.
export async function dispatchNotification(notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: { select: { phone: true } } },
  });
  // Already sent (or the row vanished) — dispatching again must be a no-op,
  // which is what makes "a retry never double-texts" true by construction.
  if (!notification || notification.status === "sent") return;

  try {
    if (notification.channel === "sms") {
      await sendSms(notification.user.phone, renderSmsBody(notification.type, notification.payload));
    }
    await prisma.notification.update({ where: { id: notification.id }, data: { status: "sent", sentAt: new Date() } });
  } catch (err) {
    const attempts = notification.attempts + 1;
    let lastError = String(err);
    if (err instanceof SmsSendError) {
      lastError = err.cause instanceof Error ? err.cause.message : String(err.cause);
    }
    console.error(`[notifications] dispatch failed for ${notification.id} (attempt ${attempts}): ${lastError}`);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { attempts, lastError, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending" },
    });
  }
}

export async function dispatchNotifications(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) await dispatchNotification(id);
}

// Retry sweep for the scheduled job (docs/phase-3-polish.md's cron task) —
// re-attempts every not-yet-exhausted pending row old enough that its
// creator's own synchronous, fire-and-forget dispatch (see withEventLock
// and cancelEvent) has certainly either finished or crashed before
// starting — the age cutoff (not an `attempts` check) is what prevents this
// sweep from racing that in-flight dispatch and double-sending the same
// brand-new row. Idempotent the same way a single dispatch is: a row
// already flipped to `sent` is simply absent from this query, so running
// the sweep twice sends nothing twice.
const RETRY_MIN_AGE_MS = 2 * 60 * 1000;

export async function retryPendingNotifications(): Promise<number> {
  const pending = await prisma.notification.findMany({
    where: { status: "pending", createdAt: { lt: new Date(Date.now() - RETRY_MIN_AGE_MS) } },
    select: { id: true },
  });
  await dispatchNotifications(pending.map((n) => n.id));
  return pending.length;
}

export interface InAppNotification {
  id: string;
  type: NotificationType;
  eventId: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

export async function listNotificationsForUser(userId: string): Promise<InAppNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, channel: "in_app" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({ id: r.id, type: r.type, eventId: r.eventId, payload: r.payload, readAt: r.readAt, createdAt: r.createdAt }));
}

export function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, channel: "in_app", readAt: null } });
}

// Scoped to the owning user at the query level — a route can call this with
// any notification id from the URL without a separate ownership check.
export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, channel: "in_app", readAt: null }, data: { readAt: new Date() } });
}

// Scoped to `in_app` only, matching exactly what listNotificationsForUser
// shows — `sms` rows are Twilio delivery-tracking (attempts/lastError, used
// by retryPendingNotifications), never rendered on /notifications, and not
// this user-facing action's business to touch.
export async function clearNotifications(userId: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { userId, channel: "in_app" } });
}
