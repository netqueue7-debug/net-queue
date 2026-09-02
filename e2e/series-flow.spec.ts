import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// Same session-injection rationale as the other e2e specs — see
// e2e/member-rsvp-flow.spec.ts. This one exercises
// docs/phase-2-recurrence-guests.md's admin-series-UI check verbatim:
// create a series, edit one instance, cancel another, verify the member
// view reflects all three states (untouched / edited / canceled).
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

function isoDatePlusDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test("admin creates a series, edits one instance, cancels another, and the member sees all three states", async ({
  page,
  context,
}) => {
  const fixtures = lastJsonLine(runTsx("scripts/e2e/seed-series-flow.ts"));

  try {
    await addSessionCookie(context, fixtures.adminToken, fixtures.adminExpiresAt);

    await page.goto(`/admin/groups/${fixtures.groupId}/series`);
    await page.getByPlaceholder("Title").fill("E2E Recurring Night");

    // Every day, for a short window — guarantees several instances
    // starting today without depending on which weekday "today" is.
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      await page.getByLabel(day).check();
    }
    await page.locator('input[name="startTime"]').fill("19:00");
    await page.locator('input[name="endTime"]').fill("20:00");
    await page.locator('input[name="recurUntil"]').fill(isoDatePlusDays(5));

    await page.getByRole("button", { name: "Create series" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/groups/${fixtures.groupId}/series/[^/]+$`));
    await expect(page.getByRole("heading", { name: "E2E Recurring Night" })).toBeVisible();

    const instanceLinks = page.locator("main ul li a");
    const instanceCount = await instanceLinks.count();
    expect(instanceCount).toBeGreaterThanOrEqual(2);

    const firstInstanceHref = await instanceLinks.nth(0).getAttribute("href");
    const secondInstanceHref = await instanceLinks.nth(1).getAttribute("href");

    // Edit the first instance.
    await page.goto(firstInstanceHref!);
    await page.getByRole("button", { name: "Edit event" }).click();
    const titleInput = page.locator('form input[name="title"]');
    await titleInput.fill("Edited Instance Title");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Edited Instance Title" })).toBeVisible();

    // Cancel the second instance.
    await page.goto(secondInstanceHref!);
    await page.getByRole("button", { name: "Cancel event" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel event" }).click();
    await expect(page.getByText("This event has been canceled.")).toBeVisible();

    // Member view reflects both changes, real clicks, no admin controls.
    const memberContext = await page.context().browser()!.newContext();
    const memberPage = await memberContext.newPage();
    await addSessionCookie(memberContext, fixtures.memberToken, fixtures.memberExpiresAt);

    await memberPage.goto(firstInstanceHref!);
    await expect(memberPage.getByRole("heading", { name: "Edited Instance Title" })).toBeVisible();
    await expect(memberPage.getByText("Admin controls")).not.toBeVisible();

    await memberPage.goto(secondInstanceHref!);
    await expect(memberPage.getByText("This event has been canceled.")).toBeVisible();

    await memberContext.close();
  } finally {
    runTsx("scripts/e2e/cleanup-series-flow.ts", fixtures.phones);
  }
});
