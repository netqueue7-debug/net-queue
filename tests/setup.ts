import { vi } from "vitest";

// Global safety net: no test should ever place a real Twilio call. Most
// test files don't care about SMS at all — they just happen to exercise a
// service (RSVP cancel, capacity change, group upgrade requests, ...) that
// enqueues+dispatches a notification as a side effect. Without this, any
// environment with TWILIO_MESSAGING_SERVICE_SID configured (shared across
// QA/production per docs/phase-0-foundations.md) sends real texts during a
// test run. A file that wants to assert on send content/count (e.g.
// tests/notifications.test.ts) declares its own vi.mock for this module,
// which takes precedence over this default for that file.
vi.mock("@/lib/notifications/sms", () => ({
  sendSms: vi.fn(async () => {}),
}));
