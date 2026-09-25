// Local-dev / one-time-bootstrap tool: creates a "default" organization (if
// none exists yet) and its first admin. Real, self-serve organization
// signup happens through /register instead (see app/api/register/route.ts)
// — this script exists for spinning up a fresh local DB, not for onboarding
// real organizations.
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@yourcompany.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Super Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  let org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: "Default Organization", slug: "default" } });
    await prisma.appSettings.create({ data: { organizationId: org.id } });
    console.log(`Created default organization (id=${org.id}).`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const adminCount = await prisma.user.count({ where: { organizationId: org.id, role: "ADMIN" } });

  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      name,
      email,
      role: "ADMIN",
      employeeCode: `ADM${String(adminCount + 1).padStart(3, "0")}`,
      passwordHash,
      // The first admin of a freshly-seeded org — same invariant /register
      // establishes for a real signup (see the schema comment on
      // User.isOwner).
      isOwner: adminCount === 0,
    },
  });

  console.log("Created first admin:");
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Password: ${password} (change this after first login)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
