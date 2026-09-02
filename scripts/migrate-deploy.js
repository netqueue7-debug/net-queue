// Neon's pooled endpoint (hostname contains `-pooler.`) multiplexes connections
// PgBouncer-style, so `prisma migrate deploy`'s advisory lock acquire/check can
// land on different backend connections and hang until P1002 times out. Run the
// migration against Neon's direct (unpooled) endpoint instead; the app itself
// keeps using the pooled DATABASE_URL at runtime via lib/db.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS script, no build step
const { execSync } = require("node:child_process");

const pooledUrl = process.env.DATABASE_URL;
if (!pooledUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const directUrl = pooledUrl.replace("-pooler.", ".");

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: directUrl },
});
