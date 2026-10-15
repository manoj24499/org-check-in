// Creates, resets and removes the throwaway organization the load test runs against.
//
//   node loadtest/seed.cjs up --employees 300   create "loadtest-xxxxxx" with 1 admin and N employees
//   node loadtest/seed.cjs up --employees 300 --face-image selfie.jpg
//                                               same, and also enrol that face for every employee with the face
//                                               service (FACE_VERIFY_URL / FACE_VERIFY_API_KEY from .env), so the
//                                               test includes face verification
//   node loadtest/seed.cjs reset                remove today's check-ins, pings and tokens (so a test can run again)
//   node loadtest/seed.cjs down                 delete the test organization and everything in it
//   node loadtest/seed.cjs down --all           delete EVERY organization whose slug starts with "loadtest-"
//
// Run from the project root (it reads .env there). Only ever touches organizations whose slug starts with
// "loadtest-", so real organizations cannot be reached by mistake. The login details are written to
// loadtest/.state.json (not printed).
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const root = process.cwd();
require(path.join(root, "node_modules/dotenv")).config({ path: path.join(root, ".env"), quiet: true });
const { PrismaClient } = require(path.join(root, "node_modules/@prisma/client"));
const { PrismaPg } = require(path.join(root, "node_modules/@prisma/adapter-pg"));
const bcrypt = require(path.join(root, "node_modules/bcryptjs"));

const STATE = path.join(__dirname, ".state.json");
const SLUG_PREFIX = "loadtest-";
// Every virtual user sends a made-up address in this range (10.77.x.x), so the per-IP rate limits treat them
// as separate people. Their rate-limit rows are removed on reset/down.
const FAKE_IP_PREFIX = "10.77.";

const FACE_URL = process.env.FACE_VERIFY_URL;
const FACE_KEY = process.env.FACE_VERIFY_API_KEY;
const faceId = (orgId, code) => `${orgId}_${code}`; // same identity the app uses (lib/faceVerify.ts)

/** Runs `worker` over `items`, a few at a time. */
async function pool(items, concurrency, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

async function enrolFaces(orgId, codes, imagePath) {
  if (!FACE_URL) throw new Error("FACE_VERIFY_URL is not set (check .env) - cannot enrol faces.");
  const image = fs.readFileSync(imagePath);
  const ok = [];
  let complained = false;
  console.log(`Enrolling the face for ${codes.length} employees with the face service (2 at a time)...`);
  await pool(codes, 2, async (code) => {
    try {
      const form = new FormData();
      form.set("employee_id", faceId(orgId, code));
      form.set("image", new Blob([image], { type: "image/jpeg" }), "enroll.jpg");
      const res = await fetch(new URL("/embed", FACE_URL), { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success !== false) ok.push(code);
      else if (!complained) {
        complained = true;
        console.log(`  an enrolment was refused (${res.status}): ${body.message ?? "no message"}. Is there a clear face in the image?`);
      }
    } catch (e) {
      if (!complained) {
        complained = true;
        console.log(`  enrolment error: ${e.message}`);
      }
    }
    if (ok.length && ok.length % 50 === 0) console.log(`  ${ok.length}/${codes.length} enrolled`);
  });
  return ok;
}

async function removeFaces(orgId, codes) {
  if (codes.length === 0) return;
  if (!FACE_URL || !FACE_KEY) {
    console.log(`!! Could not remove the face enrolments (FACE_VERIFY_URL / FACE_VERIFY_API_KEY missing). Their ids start with ${orgId}_`);
    return;
  }
  let removed = 0;
  await pool(codes, 4, async (code) => {
    try {
      const res = await fetch(new URL(`/employees/${encodeURIComponent(faceId(orgId, code))}`, FACE_URL), {
        method: "DELETE",
        headers: { "x-api-key": FACE_KEY },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok || res.status === 404) removed += 1;
    } catch {
      /* counted below */
    }
  });
  console.log(`Removed ${removed}/${codes.length} face enrolments from the face service.`);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }),
});

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function readState() {
  if (!fs.existsSync(STATE)) throw new Error("No loadtest/.state.json - run `node loadtest/seed.cjs up` first.");
  return JSON.parse(fs.readFileSync(STATE, "utf8"));
}

async function clearRateLimits(orgId) {
  await prisma.rateLimitBucket.deleteMany({
    where: { OR: [{ key: { contains: `:${orgId}:` } }, { key: { contains: `:${FAKE_IP_PREFIX}` } }] },
  });
}

async function up() {
  const count = Number.parseInt(arg("employees", "300"), 10);
  if (!(count >= 1 && count <= 5000)) throw new Error("--employees must be between 1 and 5000");

  const tag = crypto.randomBytes(3).toString("hex");
  const slug = `${SLUG_PREFIX}${tag}`;
  const org = await prisma.organization.create({ data: { name: `Load test ${tag}`, slug } });

  const adminPassword = crypto.randomBytes(12).toString("base64url") + "A1!";
  const adminEmail = `admin-${tag}@loadtest.test`;
  await prisma.user.create({
    data: {
      employeeCode: "ADM001",
      name: "Load Test Admin",
      email: adminEmail,
      role: "ADMIN",
      isOwner: true,
      organizationId: org.id,
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  // One PIN and one hash for everyone: hashing is slow on purpose (cost 12, the same as the app), so hashing
  // 300 separate PINs would take over a minute and prove nothing. Logging in still does a real compare.
  const pin = String(crypto.randomInt(100000, 999999));
  const pinHash = await bcrypt.hash(pin, 12);

  // 10% field workers, 20% work-from-home, 70% office - roughly a typical mix.
  const modeFor = (i) => (i % 10 === 0 ? "FIELD" : i % 5 === 1 ? "WFH" : "OFFICE");
  const employees = [];
  for (let i = 1; i <= count; i++) {
    const code = `LT${String(i).padStart(4, "0")}`;
    employees.push({
      employeeCode: code,
      name: `Load Test ${i}`,
      email: `${code.toLowerCase()}-${tag}@loadtest.test`,
      role: "EMPLOYEE",
      workMode: modeFor(i),
      organizationId: org.id,
      pinHash,
    });
  }
  for (let i = 0; i < employees.length; i += 500) {
    await prisma.user.createMany({ data: employees.slice(i, i + 500) });
  }

  const faceImage = arg("face-image", null);
  let faceEnrolled = 0;
  if (faceImage) {
    if (!fs.existsSync(faceImage)) throw new Error(`--face-image file not found: ${faceImage}`);
    const enrolled = await enrolFaces(org.id, employees.map((e) => e.employeeCode), faceImage);
    faceEnrolled = enrolled.length;
    if (enrolled.length) {
      await prisma.user.updateMany({
        where: { organizationId: org.id, employeeCode: { in: enrolled } },
        data: { faceVerificationEnabled: true },
      });
    }
    console.log(`Face verification is switched on for ${enrolled.length} of ${count} employees.`);
  }

  fs.writeFileSync(
    STATE,
    JSON.stringify(
      {
        orgId: org.id,
        slug,
        pin,
        admin: { email: adminEmail, password: adminPassword },
        faceEnrolled,
        employees: employees.map((e) => ({ code: e.employeeCode, workMode: e.workMode })),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Created organization ${slug} with ${count} employees and 1 admin.`);
  console.log("Login details are in loadtest/.state.json (not shown here).");
}

async function reset() {
  const s = readState();
  if (!s.slug.startsWith(SLUG_PREFIX)) throw new Error("Refusing: state file does not point at a loadtest organization.");
  const where = { user: { organizationId: s.orgId } };
  const a = await prisma.attendance.deleteMany({ where });
  const p = await prisma.locationPing.deleteMany({ where });
  // refresh tokens only carry the user id, not a link to the user
  const ids = (await prisma.user.findMany({ where: { organizationId: s.orgId }, select: { id: true } })).map((u) => u.id);
  const t = await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await clearRateLimits(s.orgId);
  console.log(`Reset ${s.slug}: removed ${a.count} attendance rows, ${p.count} location pings, ${t.count} refresh tokens.`);
}

async function removeOrg(org) {
  if (!org.slug.startsWith(SLUG_PREFIX)) throw new Error(`Refusing to delete ${org.slug}`);
  const enrolled = await prisma.user.findMany({
    where: { organizationId: org.id, faceVerificationEnabled: true },
    select: { employeeCode: true },
  });
  await removeFaces(org.id, enrolled.map((u) => u.employeeCode));
  await prisma.organization.delete({ where: { id: org.id } });
  await clearRateLimits(org.id);
  console.log(`Deleted ${org.slug}`);
}

async function down() {
  if (flag("all")) {
    const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG_PREFIX } }, select: { id: true, slug: true } });
    for (const o of orgs) await removeOrg(o);
    if (fs.existsSync(STATE)) fs.unlinkSync(STATE);
    console.log(`Done. ${orgs.length} loadtest organization(s) removed.`);
  } else {
    const s = readState();
    await removeOrg({ id: s.orgId, slug: s.slug });
    fs.unlinkSync(STATE);
  }
  console.log("loadtest organizations left:", await prisma.organization.count({ where: { slug: { startsWith: SLUG_PREFIX } } }));
}

const commands = { up, reset, down };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error("Usage: node loadtest/seed.cjs up --employees 300 | reset | down [--all]");
  process.exit(1);
}
commands[cmd]()
  .catch((e) => {
    console.error("Failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
