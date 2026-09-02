// Scheduled job: remind going + waitlist the day before each event, in the
// event's own timezone. Idempotent — see lib/notifications/jobs.ts.
//
// Run with: npm run job:day-before-reminder
// Intended cadence: once daily.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runDayBeforeReminderJob } = await import("../../lib/notifications/jobs");
  const { prisma } = await import("../../lib/db");

  const count = await runDayBeforeReminderJob();
  console.log(`Sent ${count} day-before reminder(s).`);

  await prisma.$disconnect();
}

main();
