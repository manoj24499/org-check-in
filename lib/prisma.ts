import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// 1. Create the database adapter
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// 2. Reuse global instance or instantiate a new client WITH the adapter attached
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// 3. Prevent multiple instances in development due to Next.js Fast Refresh / HMR
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
