import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// Same rationale as e2e/member-rsvp-flow.spec.ts: sessions are seeded
// directly and injected as cookies rather than driving real OTP through
// the browser (already covered by tests/otp-verify-route.test.ts). What
// *is* exercised for real here: the /join/:code redirect chain (real
// server-side redirects, not just unit-tested logic) and the admin
// approval queue's real clicks against the real API.
function runTsx(scriptRelativePath: string, args: string[] = []): string {
  return execFileSync("npx", ["tsx", scriptRelativePath, ...args], { cwd: ROOT, encoding: "utf-8" });
}

function lastJsonLine(output: string) {
  return JSON.parse(output.trim().split("\n").at(-1) ?? "");
}

async function addSessionCookie(
  context: import("@playwright/test").BrowserContext,
  token: string,
  expiresAt: string,
) {
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

test.describe("join flow", () => {
  let fixtures: {
    memberOpenToken: string;
    memberOpenExpiresAt: string;
    memberApprovalToken: string;
    memberApprovalExpiresAt: string;
    notOnboardedToken: string;
    notOnboardedExpiresAt: string;
    groupAdminToken: string;
    groupAdminExpiresAt: string;
    openGroupJoinCode: string;
    approvalGroupId: string;
    approvalGroupJoinCode: string;
    phones: string[];
  };

  test.beforeAll(() => {
    fixtures = lastJsonLine(runTsx("scripts/e2e/seed-join-flow.ts"));
  });

  test.afterAll(() => {
    runTsx("scripts/e2e/cleanup-join-flow.ts", fixtures.phones);
  });

  test("an unauthenticated visitor is redirected to login with the join code preserved", async ({ page }) => {
    await page.goto(`/join/${fixtures.openGroupJoinCode}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fjoin%2F${fixtures.openGroupJoinCode}`));
  });

  test("an authenticated-but-not-onboarded visitor is redirected to onboarding with the join code preserved", async ({
    page,
    context,
  }) => {
    await addSessionCookie(context, fixtures.notOnboardedToken, fixtures.notOnboardedExpiresAt);
    await page.goto(`/join/${fixtures.openGroupJoinCode}`);
    await expect(page).toHaveURL(new RegExp(`/onboarding\\?next=%2Fjoin%2F${fixtures.openGroupJoinCode}`));
  });

  test("an onboarded member joins an open group immediately", async ({ page, context }) => {
    await addSessionCookie(context, fixtures.memberOpenToken, fixtures.memberOpenExpiresAt);
    await page.goto(`/join/${fixtures.openGroupJoinCode}`);
    await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
    await expect(page.getByText("E2E Join Flow Open Group")).toBeVisible();

    // The membership really is active now, not just a friendly message.
    await page.goto("/groups");
    await expect(page.getByText("E2E Join Flow Open Group")).toBeVisible();
    await expect(page.getByText("Pending approval")).not.toBeVisible();
  });

  test("an onboarded member requesting an approval group sees pending, then an admin approving it lets them in", async ({
    browser,
  }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await addSessionCookie(memberContext, fixtures.memberApprovalToken, fixtures.memberApprovalExpiresAt);

    await memberPage.goto(`/join/${fixtures.approvalGroupJoinCode}`);
    await expect(memberPage.getByRole("heading", { name: "Request sent" })).toBeVisible();

    await memberPage.goto("/groups");
    await expect(memberPage.getByText("Pending approval")).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await addSessionCookie(adminContext, fixtures.groupAdminToken, fixtures.groupAdminExpiresAt);

    await adminPage.goto(`/groups/${fixtures.approvalGroupId}/members`);
    await expect(adminPage.getByText("E2E Approval Joiner")).toBeVisible();
    await adminPage.getByRole("button", { name: "Approve" }).click();
    await expect(adminPage.getByText("No pending join requests.")).toBeVisible();

    await memberPage.goto("/groups");
    await expect(memberPage.getByText("Pending approval")).not.toBeVisible();

    await memberContext.close();
    await adminContext.close();
  });
});
