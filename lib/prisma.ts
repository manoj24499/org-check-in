import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  // The database is reached through Supabase's session-mode pooler, which allows only 15 client connections
  // in total, shared by every running copy of the app (the server, a dev server, scripts). node-postgres
  // opens up to 10 per process by default, so two copies could already exhaust it and every request would
  // fail with EMAXCONNSESSION. Keep each process small and let idle connections go.
  // Raise DB_POOL_MAX only if the pooler's limit is raised too.
  const max = Number.parseInt(process.env.DB_POOL_MAX ?? "", 10) || 5;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max,
    idleTimeoutMillis: 10_000,
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
      supportTicket: {
        photo: true,
      },
      user: {
        profilePhoto: true,
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
