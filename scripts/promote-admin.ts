import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../lib/db");
  const { normalizeUsPhone } = await import("../lib/auth/otp");

  const phoneArg = process.argv[2];
  if (!phoneArg) {
    console.error("Usage: npm run admin:promote -- <phone>");
    process.exit(1);
  }

  const phone = normalizeUsPhone(phoneArg);

  const user = await prisma.user.upsert({
    where: { phone },
    update: { role: "admin" },
    create: { phone, role: "admin" },
  });

  console.log(`Promoted ${user.displayName ?? user.phone} (${user.id}) to admin.`);
  await prisma.$disconnect();
}

main();
