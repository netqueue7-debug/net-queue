// Neon's pooled endpoint (hostname contains `-pooler.`) multiplexes connections
// PgBouncer-style, so `prisma migrate deploy`'s advisory lock acquire/check can
// land on different backend connections and hang until P1002 times out. Run the
// migration against Neon's direct (unpooled) endpoint instead; the app itself
// keeps using the pooled DATABASE_URL at runtime via lib/db.ts.
//
// Separately, Neon scales suspended (idle) computes to zero. Waking one back up
// can itself take several seconds, and `prisma migrate deploy` allows only a
// fixed 10s to acquire its migration advisory lock — a cold start can burn
// through that budget by itself and fail with P1002 before any real contention.
// Ping the direct endpoint first (generous timeout, off the 10s clock) so the
// compute is already warm by the time migrate deploy runs, and retry a couple
// times in case of a genuinely transient blip.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS script, no build step
const { execSync } = require("node:child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS script, no build step
const { Client } = require("pg");

const pooledUrl = process.env.DATABASE_URL;
if (!pooledUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const directUrl = pooledUrl.replace("-pooler.", ".");

async function warmUp() {
  const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 30000 });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
}

const MAX_ATTEMPTS = 3;

async function main() {
  await warmUp();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: directUrl },
      });
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      console.error(`migrate deploy attempt ${attempt} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
