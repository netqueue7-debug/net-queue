// Scheduled job: notify all active group members the moment an event's
// signup window opens. Idempotent — see lib/notifications/jobs.ts.
//
// Run with: npm run job:signup-opened
// Intended cadence: every 5-15 minutes.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runSignupOpenedJob } = await import("../../lib/notifications/jobs");
  const { prisma } = await import("../../lib/db");

  const count = await runSignupOpenedJob();
  console.log(`Sent ${count} signup-opened notification(s).`);

  await prisma.$disconnect();
}

main();
