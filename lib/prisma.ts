import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  // The database is reached through Supabase's session-mode pooler, which allows only 15 client connections
  // in total, shared by every running copy of the app (the server, a dev server, scripts). node-postgres
  // opens up to 10 per process by default, so two copies could already exhaust it and every request would
  // fail with EMAXCONNSESSION. Keep each process small and let idle connections go.
  // Raise DB_POOL_MAX only if the pooler's limit is raised too.
  //
  // DATABASE_POOL_URL, when set, is the pooler's *transaction-mode* address (Supabase: port 6543). Transaction
  // mode hands a connection out only for the length of one query, so hundreds of clients can share it, and the
  // 15-client session limit above stops being a problem. It is used only here, at runtime: migrations and scripts
  // keep using DATABASE_URL (session mode), which they need.
  const max = Number.parseInt(process.env.DB_POOL_MAX ?? "", 10) || 5;
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_POOL_URL || process.env.DATABASE_URL!,
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

// Keep the client on globalThis in production too, not only in development. A built Next.js server loads its code
// as several separate bundles (page rendering, API routes, ...), and a plain module-level `prisma` is created once
// PER BUNDLE: each one then opened its own pool of connections, so one server was using two or three times the
// connections it was meant to, against a database that allows 15 in total. globalThis is shared by all of them,
// so there is now a single pool per process. (In development it also stops Fast Refresh from creating new ones.)
globalForPrisma.prisma = prisma;
