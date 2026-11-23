// Sets the admin's password to SEED_ADMIN_PASSWORD from .env (for SEED_ADMIN_EMAIL).
// `prisma db seed` only creates the admin once and skips it afterwards, so use this to change it later.
// Usage (from the project folder):  node scripts/set-seed-admin-password.cjs
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const url = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });

(async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env first.");
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query(
    `UPDATE "User" SET "passwordHash"=$1 WHERE email=$2 AND role::text=$3 RETURNING email`,
    [hash, email, "ADMIN"],
  );
  console.log(r.rowCount ? `Updated the password for ${r.rows[0].email}.` : `No admin found with email ${email}.`);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
