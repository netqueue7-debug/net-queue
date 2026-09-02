// Scheduled job: notify the going list the moment each event's location
// reveal time passes. Idempotent — see lib/notifications/jobs.ts.
//
// Run with: npm run job:location-reveal
// Intended cadence: every 5-15 minutes.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runLocationRevealJob } = await import("../../lib/notifications/jobs");
  const { prisma } = await import("../../lib/db");

  const count = await runLocationRevealJob();
  console.log(`Sent ${count} location-reveal notification(s).`);

  await prisma.$disconnect();
}

main();
