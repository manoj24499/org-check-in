// Read-only: finds which already-enrolled employee a photo matches, by asking the face service to
// compare the photo against each enrolled employee one at a time (POST /verify, same call a
// check-in makes). Changes nothing in the database or on the face service.
//
// Usage (run where FACE_VERIFY_URL is reachable, e.g. the production server):
//   node scripts/find-face-duplicate.mjs <photo.jpg> [EMP132]
// The optional second argument is the employee code to skip (the person trying to enroll).
import fs from "node:fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const [photoPath, skipCode] = process.argv.slice(2);
if (!photoPath) {
  console.error("Usage: node scripts/find-face-duplicate.mjs <photo.jpg> [employeeCodeToSkip]");
  process.exit(1);
}
const baseUrl = process.env.FACE_VERIFY_URL;
if (!baseUrl) {
  console.error("FACE_VERIFY_URL is not set");
  process.exit(1);
}

const bytes = fs.readFileSync(photoPath);
const url = (process.env.DATABASE_URL || "").replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const local = /localhost|127\.0\.0\.1/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });

const { rows } = await pool.query(
  `SELECT "organizationId" o, "employeeCode" c, name FROM "User"
   WHERE role = 'EMPLOYEE' AND "faceVerificationEnabled" = true AND ("employeeCode" <> $1 OR $1 IS NULL)
   ORDER BY "employeeCode"`,
  [skipCode ?? null],
);
await pool.end();
console.log(`Comparing against ${rows.length} enrolled employees...`);

const results = [];
let failed = 0;
for (const u of rows) {
  try {
    const form = new FormData();
    form.set("employee_id", `${u.o}_${u.c}`);
    form.set("image", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(new URL("/verify", baseUrl), { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    results.push({ code: u.c, name: u.name, similarity: typeof d.similarity === "number" ? d.similarity : null, matched: d.success === true, message: d.message });
  } catch (e) {
    failed++;
    console.error(`  ${u.c}: ${e.message}`);
  }
}

results.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
console.log("\nClosest matches:");
for (const r of results.slice(0, 5)) {
  console.log(`  ${r.code}  ${r.name.padEnd(28)} similarity ${r.similarity ?? "n/a"}  ${r.matched ? "MATCH" : ""}`);
}
if (failed) console.log(`\n${failed} employee(s) could not be checked (see errors above).`);
if (!results.some((r) => r.matched)) console.log("\nNo enrolled employee matched this photo.");
