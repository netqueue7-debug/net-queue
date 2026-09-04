import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  enqueueNotification,
  dispatchNotification,
  retryPendingNotifications,
  listNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} from "@/lib/notifications/notifications";

const sendSmsMock = vi.fn();
vi.mock("@/lib/notifications/sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/sms")>();
  return { ...actual, sendSms: (...args: unknown[]) => sendSmsMock(...args) };
});

const sendPushMock = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendPushMock(...args),
  },
}));

describe("notifications dispatcher", () => {
  const phone = "+15555551000";
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { phone } });
    userId = user.id;
  });

  afterEach(() => {
    sendSmsMock.mockReset();
    sendPushMock.mockReset();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.pushSubscription.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("enqueues an SMS notification as pending, and an in-app one as already sent", async () => {
    const [sms, inApp] = await prisma.$transaction(async (tx) => {
      const s = await enqueueNotification(tx, { userId, eventId: null, type: "rsvp_promoted", payload: { eventTitle: "X" } });
      const i = await enqueueNotification(tx, { userId, eventId: null, type: "guest_approved", payload: { guestName: "Y" } });
      return [s, i];
    });

    expect(sms.channel).toBe("sms");
    expect(sms.status).toBe("pending");
    expect(inApp.channel).toBe("in_app");
    expect(inApp.status).toBe("sent");
    expect(inApp.sentAt).not.toBeNull();
  });

  it("dispatch: a successful send marks the row sent, and re-dispatching it is a no-op (idempotent)", async () => {
    sendSmsMock.mockResolvedValue(undefined);
    const notification = await prisma.notification.create({
      data: { userId, type: "rsvp_promoted", channel: "sms", payload: { eventTitle: "Tuesday Volleyball" } },
    });

    await dispatchNotification(notification.id);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith(phone, expect.stringContaining("Tuesday Volleyball"));

    const sent = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).not.toBeNull();

    // Retry never double-texts — a second dispatch on an already-sent row must not call sendSms again.
    await dispatchNotification(notification.id);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
  });

  it("dispatch: a Twilio failure leaves the row pending for retry, with attempts and lastError recorded, and never throws", async () => {
    sendSmsMock.mockRejectedValue(new Error("network blip"));
    const notification = await prisma.notification.create({
      data: { userId, type: "event_canceled", channel: "sms", payload: { eventTitle: "Canceled Night" } },
    });

    await expect(dispatchNotification(notification.id)).resolves.toBeUndefined();

    const failed = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(failed.status).toBe("pending"); // still retryable — not permanently failed after just one attempt
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain("network blip");
  });

  it("dispatch: a row is marked permanently failed once attempts are exhausted", async () => {
    sendSmsMock.mockRejectedValue(new Error("still broken"));
    const notification = await prisma.notification.create({
      data: { userId, type: "event_canceled", channel: "sms", payload: { eventTitle: "X" }, attempts: 4 },
    });

    await dispatchNotification(notification.id);

    const result = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(result.status).toBe("failed");
    expect(result.attempts).toBe(5);
  });

  it("retry sweep only re-attempts pending rows old enough to not race an in-flight dispatch", async () => {
    sendSmsMock.mockResolvedValue(undefined);
    const freshlyCreated = await prisma.notification.create({
      data: { userId, type: "rsvp_promoted", channel: "sms", payload: { eventTitle: "Fresh" } },
    });
    const staleOne = await prisma.notification.create({
      data: {
        userId,
        type: "rsvp_promoted",
        channel: "sms",
        payload: { eventTitle: "Stale" },
        attempts: 1,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    const retried = await retryPendingNotifications();
    expect(retried).toBe(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith(phone, expect.stringContaining("Stale"));

    const fresh = await prisma.notification.findUniqueOrThrow({ where: { id: freshlyCreated.id } });
    expect(fresh.status).toBe("pending"); // untouched by the sweep — too new

    const stale = await prisma.notification.findUniqueOrThrow({ where: { id: staleOne.id } });
    expect(stale.status).toBe("sent");
  });

  it("dispatch: an in-app notification also pushes to every subscription the user has, without touching status/attempts", async () => {
    sendPushMock.mockResolvedValue(undefined);
    const sub = await prisma.pushSubscription.create({
      data: { userId, endpoint: "https://push.example.com/a", p256dh: "p256dh", auth: "auth" },
    });

    const notification = await prisma.notification.create({
      data: { userId, type: "guest_approved", channel: "in_app", status: "sent", sentAt: new Date(), payload: { guestName: "Robin" } },
    });

    await dispatchNotification(notification.id);

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    const [pushSub, body] = sendPushMock.mock.calls[0];
    expect(pushSub).toEqual({ endpoint: sub.endpoint, keys: { p256dh: "p256dh", auth: "auth" } });
    expect(JSON.parse(body).body).toContain("Robin");

    // Untouched — in-app delivery-tracking fields are SMS-only.
    const unchanged = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(unchanged.status).toBe("sent");
    expect(unchanged.attempts).toBe(0);

    await prisma.pushSubscription.delete({ where: { id: sub.id } });
  });

  it("dispatch: a push send that comes back 410 (gone) deletes the dead subscription instead of erroring", async () => {
    const sub = await prisma.pushSubscription.create({
      data: { userId, endpoint: "https://push.example.com/dead", p256dh: "p256dh", auth: "auth" },
    });
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendPushMock.mockRejectedValue(err);

    const notification = await prisma.notification.create({
      data: { userId, type: "guest_rejected", channel: "in_app", status: "sent", sentAt: new Date(), payload: { guestName: "Robin" } },
    });

    await expect(dispatchNotification(notification.id)).resolves.toBeUndefined();

    const gone = await prisma.pushSubscription.findUnique({ where: { id: sub.id } });
    expect(gone).toBeNull();
  });

  it("in-app: listing, unread count, and marking read/read-all", async () => {
    await prisma.notification.deleteMany({ where: { userId } }); // isolate from earlier tests in this file

    await prisma.$transaction(async (tx) => {
      await enqueueNotification(tx, { userId, eventId: null, type: "guest_approved", payload: { guestName: "A" } });
      await enqueueNotification(tx, { userId, eventId: null, type: "guest_rejected", payload: { guestName: "B" } });
    });

    expect(await countUnreadNotifications(userId)).toBe(2);

    const list = await listNotificationsForUser(userId);
    expect(list).toHaveLength(2);

    await markNotificationRead(list[0].id, userId);
    expect(await countUnreadNotifications(userId)).toBe(1);

    await markAllNotificationsRead(userId);
    expect(await countUnreadNotifications(userId)).toBe(0);
  });

  it("clearNotifications deletes only this user's in_app rows, leaving sms rows (delivery history) untouched", async () => {
    await prisma.notification.deleteMany({ where: { userId } }); // isolate from earlier tests in this file

    await prisma.$transaction(async (tx) => {
      await enqueueNotification(tx, { userId, eventId: null, type: "guest_approved", payload: { guestName: "A" } }); // in_app
      await enqueueNotification(tx, { userId, eventId: null, type: "rsvp_promoted", payload: { eventTitle: "X" } }); // sms
    });
    expect(await prisma.notification.count({ where: { userId } })).toBe(2);

    await clearNotifications(userId);

    const remaining = await prisma.notification.findMany({ where: { userId } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].channel).toBe("sms");
    expect(await listNotificationsForUser(userId)).toHaveLength(0);
  });
});
