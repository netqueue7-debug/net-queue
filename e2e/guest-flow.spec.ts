import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// Same session-injection rationale as the other e2e specs. This one
// exercises docs/phase-2-recurrence-guests.md's "UI for parties" check
// verbatim: member RSVPs with 2 guests, admin approves, member sees the
// party in the going list.
function runTsx(scriptRelativePath: string, args: string[] = []): string {
  return execFileSync("npx", ["tsx", scriptRelativePath, ...args], { cwd: ROOT, encoding: "utf-8" });
}

function lastJsonLine(output: string) {
  return JSON.parse(output.trim().split("\n").at(-1) ?? "");
}

async function addSessionCookie(context: import("@playwright/test").BrowserContext, token: string, expiresAt: string) {
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
}

test("member RSVPs with 2 guests, admin approves both, member sees the party as a unit", async ({ page, context, browser }) => {
  const fixtures = lastJsonLine(runTsx("scripts/e2e/seed-guest-flow.ts"));

  try {
    await addSessionCookie(context, fixtures.memberToken, fixtures.memberExpiresAt);

    await page.goto(`/events/${fixtures.eventId}`);
    await page.getByRole("button", { name: "RSVP" }).click();
    await expect(page.getByText("E2E Guest Member")).toBeVisible();

    await page.getByPlaceholder("Guest names, comma separated (optional)").fill("Alice, Bob");
    await page.getByRole("button", { name: "Add guest" }).click();

    await expect(page.getByText("Alice (pending approval)")).toBeVisible();
    await expect(page.getByText("Bob (pending approval)")).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await addSessionCookie(adminContext, fixtures.adminToken, fixtures.adminExpiresAt);

    await adminPage.goto(`/events/${fixtures.eventId}`);
    await adminPage.getByRole("button", { name: "Approve" }).first().click();
    await expect(adminPage.getByText("(pending approval)")).toHaveCount(1);
    await adminPage.getByRole("button", { name: "Approve" }).first().click();
    await expect(adminPage.getByText("(pending approval)")).toHaveCount(0);
    await expect(adminPage.getByText("E2E Guest Member +2")).toBeVisible();

    await adminContext.close();

    await page.reload();
    await expect(page.getByText("E2E Guest Member +2")).toBeVisible();
    await expect(page.getByText("(pending approval)")).not.toBeVisible();
  } finally {
    runTsx("scripts/e2e/cleanup-guest-flow.ts", fixtures.phones);
  }
});
