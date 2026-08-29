import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// Real OTP login (Twilio Verify) is already covered end-to-end by
// tests/otp-verify-route.test.ts and a manual round-trip done during
// Phase 0 — re-driving it through a browser here would mean either a real
// SMS per test run or mocking Twilio, neither of which buys anything new.
// Instead: seed a real session directly (same createSession() the app
// itself uses) and inject it as a cookie, then exercise the actual RSVP
// journey for real: real pages, real clicks, real DB mutations.
//
// Seeding/cleanup run as a separate `tsx` child process rather than
// importing lib/db directly here — Playwright Test's own module transform
// can't load Prisma's generated (ESM-only, `import.meta`-using) client,
// the same class of issue as running it under plain `node`; `tsx` handles it.
function runTsx(scriptRelativePath: string, args: string[] = []): string {
  return execFileSync("npx", ["tsx", scriptRelativePath, ...args], { cwd: ROOT, encoding: "utf-8" });
}

test("member logs in, RSVPs, sees themselves in going, cancels, disappears from going", async ({ page, context }) => {
  const seedOutput = runTsx("scripts/e2e/seed-member-rsvp-flow.ts");
  // dotenv prints a "tip" banner to stdout on config() — our JSON is always
  // the last line regardless of what noise precedes it.
  const lastLine = seedOutput.trim().split("\n").at(-1) ?? "";
  const { token, expiresAt, eventId, memberPhone, adminPhone } = JSON.parse(lastLine);

  try {
    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        expires: Math.floor(new Date(expiresAt).getTime() / 1000),
        httpOnly: true,
      },
    ]);

    await page.goto(`/events/${eventId}`);
    await expect(page.getByRole("heading", { name: "E2E Volleyball Night" })).toBeVisible();

    await page.getByRole("button", { name: "RSVP" }).click();
    await expect(page.getByText("E2E Member")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Going \(1\)/ })).toBeVisible();

    await page.getByRole("button", { name: "Cancel RSVP" }).click();
    await expect(page.getByRole("heading", { name: /Going \(0\)/ })).toBeVisible();
  } finally {
    runTsx("scripts/e2e/cleanup-member-rsvp-flow.ts", [memberPhone, adminPhone]);
  }
});
