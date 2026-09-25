import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

// Returns the org-scoping identifiers every admin route needs, not just the
// raw session — a deliberate breaking change from the old `Session | null`
// shape. Every call site must now destructure `organizationId` and use it to
// scope its Prisma queries; leaving it unused is exactly the kind of gap
// that let app/admin/layout.tsx's badge counts run unfiltered across every
// organization before this.
export async function requireAdmin(): Promise<
  { userId: string; organizationId: string; session: Session } | null
> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN" || !session.user.organizationId) {
    return null;
  }
  return { userId: session.user.id, organizationId: session.user.organizationId, session };
}
