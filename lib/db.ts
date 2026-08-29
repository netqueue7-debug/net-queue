import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// `max` well above pg's default (10): under heavy signup contention, every
// RSVP attempt holds a connection while it queues behind withEventLock's
// per-event row lock, not just while doing real work — a small pool starves
// before the lock even matters. See scripts/load-test-rsvp.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 60 });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
