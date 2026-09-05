import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({
    adapter,
    // Photos are only ever needed by their dedicated photo route — omit them
    // by default everywhere else so list/calendar/history queries never
    // accidentally pull large binary blobs into memory.
    omit: {
      attendance: {
        photo: true,
      },
      fieldVisit: {
        photo: true,
      },
      overtimeRequest: {
        photo: true,
      },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// Reuse global instance or instantiate a new client WITH the adapter attached
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Prevent multiple instances in development due to Next.js Fast Refresh / HMR
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
