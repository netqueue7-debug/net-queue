// Scheduled job: retry-sweep any notification stuck `pending` after its
// creator's own synchronous dispatch attempt (see lib/notifications/notifications.ts
// for why the age cutoff is what makes this safe to run alongside live traffic).
//
// Run with: npm run job:retry-notifications
// Intended cadence: every few minutes, via cron/Vercel Cron/etc.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { retryPendingNotifications } = await import("../../lib/notifications/notifications");
  const { prisma } = await import("../../lib/db");

  const count = await retryPendingNotifications();
  console.log(`Retried ${count} pending notification(s).`);

  await prisma.$disconnect();
}

main();
