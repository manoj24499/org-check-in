#!/usr/bin/env node
// Load test for the check-in app. Run from the project root, against the organization created by seed.cjs.
//
//   node loadtest/run.mjs --scenario steady --stages 50,100,200,300 --hold 90 --admins 3
//   node loadtest/run.mjs --scenario rush --users 300 --window 60
//   node loadtest/run.mjs --scenario rush --users 300 --window 60 --action CHECK_OUT
//
// steady  Staged ramp: employees who are already checked in keep the app open (status poll every 30 s, location
//         ping every 60 s) while the number of employees goes up step by step. Answers "how many at once?".
// rush    Everyone checks in (or out) with a selfie inside a short window, like 9 am. Answers "how bad is the rush?".
//
// Every virtual employee sends its own made-up client address, which only works when talking to the app directly
// (http://localhost:3000, behind no proxy), so the run refuses any other address unless --allow-remote is given.
// The run stops itself if the server starts failing (see --abort-p95 and --abort-errors).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const require = createRequire(path.join(process.cwd(), "package.json"));
const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- options ----------
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const num = (name, fallback) => {
  const v = Number(opt(name, fallback));
  if (!Number.isFinite(v)) throw new Error(`--${name} must be a number`);
  return v;
};

const BASE = String(opt("base", "http://localhost:3000")).replace(/\/$/, "");
const SCENARIO = opt("scenario", "steady");
const OFFSET = num("offset", 0); // start picking employees at this index, so two runs can use different people
const STAGES = String(opt("stages", "50,100,200,300")).split(",").map((s) => Number(s.trim())).filter(Boolean);
const HOLD_S = num("hold", 90);
const USERS = num("users", 100);
const WINDOW_S = num("window", 60);
const SHAPE = opt("shape", "uniform"); // uniform | burst (everyone in the first 10% of the window)
const ACTION = opt("action", "CHECK_IN");
const ADMINS = num("admins", 0);
const PING = opt("ping", "all"); // all | field | none  (who sends location pings in the steady scenario)
const STATUS_EVERY_S = num("status-every", 30);
const PING_EVERY_S = num("ping-every", 60);
const SLO_P95_MS = num("slo-p95", 2000);
const ABORT_P95_MS = num("abort-p95", 15000);
const ABORT_ERRORS = num("abort-errors", 0.25);
const TIMEOUT_MS = num("timeout", 30000);
const SETUP_CONCURRENCY = num("setup-concurrency", 4);
const PHOTO_KB = num("photo-kb", 70);
const FACE_IMAGE = opt("face-image", null); // a real selfie (JPEG); use it when the employees were seeded with --face-image
const OUT_DIR = opt("out", path.join(here, "results"));
const WINDOW_TICK_MS = 10_000;

const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) && !has("allow-remote")) {
  console.error(`Refusing to run against ${BASE}.\nThe test relies on talking to the app directly on this machine (default http://localhost:3000).\nPass --allow-remote only if you really mean it (rate limits will then treat all users as one).`);
  process.exit(1);
}
if (!["steady", "rush"].includes(SCENARIO)) throw new Error("--scenario must be steady or rush");
if (!["CHECK_IN", "CHECK_OUT"].includes(ACTION)) throw new Error("--action must be CHECK_IN or CHECK_OUT");

const statePath = path.join(here, ".state.json");
if (!fs.existsSync(statePath)) throw new Error("No loadtest/.state.json - run `node loadtest/seed.cjs up` first.");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (!String(state.slug).startsWith("loadtest-")) throw new Error("State file does not point at a loadtest organization.");

const needed = SCENARIO === "steady" ? Math.max(...STAGES) : USERS;
const people = state.employees.slice(OFFSET, OFFSET + needed);
if (people.length < needed) throw new Error(`Need ${needed} employees from offset ${OFFSET}, but only ${people.length} exist. Seed more with --employees.`);

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toString() : "-");
let stopping = false;
let abortReason = null;
let inflight = 0;
let maxInflight = 0;
let currentStage = "setup";
const t0 = performance.now();
const now = () => performance.now() - t0;

/** Every finished request: { t, label, status, ms, stage }. status 0 means timeout or network error. */
const samples = [];
function record(label, status, ms) {
  samples.push({ t: now(), label, status, ms, stage: currentStage });
}

async function call(label, method, urlPath, { headers = {}, body, ip } = {}) {
  const started = performance.now();
  inflight += 1;
  maxInflight = Math.max(maxInflight, inflight);
  let status = 0;
  let text = "";
  let setCookie = [];
  try {
    const res = await fetch(BASE + urlPath, {
      method,
      headers: { ...(ip ? { "x-forwarded-for": ip } : {}), ...headers },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    setCookie = res.headers.getSetCookie?.() ?? [];
    text = await res.text();
  } catch {
    status = 0;
  } finally {
    inflight -= 1;
  }
  const ms = performance.now() - started;
  record(label, status, ms);
  return { status, text, ms, setCookie };
}
const json = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};

// ---------- photo (what a selfie costs the server: upload, decode, resize, store) ----------
function makePhoto() {
  if (FACE_IMAGE) {
    if (!fs.existsSync(FACE_IMAGE)) throw new Error(`--face-image file not found: ${FACE_IMAGE}`);
    return Promise.resolve("data:image/jpeg;base64," + fs.readFileSync(FACE_IMAGE).toString("base64"));
  }
  const sharp = require("sharp");
  const W = 640;
  const H = 480;
  const attempt = async (w) => {
    const h = Math.round((w * 3) / 4);
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = 90 + ((Math.random() * 120) | 0);
    return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).resize(W, H, { kernel: "cubic" }).jpeg({ quality: 75 }).toBuffer();
  };
  return (async () => {
    let buf = await attempt(64);
    for (const w of [96, 128, 160, 192, 240, 320, 400]) {
      if (buf.length >= PHOTO_KB * 1024) break;
      buf = await attempt(w);
    }
    return "data:image/jpeg;base64," + buf.toString("base64");
  })();
}

// ---------- virtual users ----------
const fakeIp = (i) => `10.77.${(i >> 8) & 255}.${i & 255}`;

class Employee {
  constructor(index, info, photo) {
    this.index = index;
    this.code = info.code;
    this.workMode = info.workMode;
    this.ip = fakeIp(OFFSET + index + 1);
    this.photo = photo;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenAt = 0;
    this.attendanceId = null;
  }
  get auth() {
    return { authorization: `Bearer ${this.accessToken}` };
  }
  async login(label = "login") {
    const r = await call(label, "POST", "/api/mobile/login", {
      method: "POST",
      ip: this.ip,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationCode: state.slug, employeeCode: this.code, pin: state.pin }),
    });
    const j = json(r.text);
    if (r.status === 200 && j?.accessToken) {
      this.accessToken = j.accessToken;
      this.refreshToken = j.refreshToken;
      this.tokenAt = now();
      return true;
    }
    return false;
  }
  async fresh() {
    // access tokens last 15 minutes; renew the way the app does
    if (now() - this.tokenAt < 10 * 60_000) return;
    const r = await call("refresh", "POST", "/api/mobile/refresh", {
      ip: this.ip,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    const j = json(r.text);
    if (r.status === 200 && j?.accessToken) {
      this.accessToken = j.accessToken;
      if (j.refreshToken) this.refreshToken = j.refreshToken;
      this.tokenAt = now();
    }
  }
  async status(label = "status") {
    await this.fresh();
    return call(label, "GET", `/api/kiosk/status?employeeCode=${this.code}`, { ip: this.ip, headers: this.auth });
  }
  async scan(action, label) {
    await this.fresh();
    const r = await call(label ?? `scan-${action === "CHECK_IN" ? "in" : "out"}`, "POST", "/api/kiosk/scan", {
      ip: this.ip,
      headers: { ...this.auth, "content-type": "application/json" },
      body: JSON.stringify({
        employeeCode: this.code,
        pin: state.pin,
        action,
        photo: this.photo,
        latitude: 11.0168,
        longitude: 76.9558,
      }),
    });
    if (r.status === 200 && action === "CHECK_IN") this.attendanceId = json(r.text)?.id ?? this.attendanceId;
    return r;
  }
  async ping() {
    if (!this.attendanceId) return null;
    return call("location-ping", "POST", "/api/kiosk/location", {
      ip: this.ip,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        attendanceId: this.attendanceId,
        latitude: 11.0168 + (Math.random() - 0.5) * 0.002,
        longitude: 76.9558 + (Math.random() - 0.5) * 0.002,
        accuracy: 12,
        timestamp: new Date().toISOString(),
      }),
    });
  }
}

/** Runs `worker` over `items` with a fixed number in flight, so setup does not itself overload the server. */
async function pool(items, concurrency, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && !stopping) await worker(items[next++]);
    }),
  );
}

// ---------- admin tabs ----------
async function adminLogin() {
  const csrf = await call("admin-login", "GET", "/api/auth/csrf", { ip: "10.77.250.1" });
  const token = json(csrf.text)?.csrfToken;
  const jar = new Map();
  const keep = (list) => list.forEach((c) => jar.set(c.split("=")[0], c.split(";")[0]));
  keep(csrf.setCookie);
  if (!token) return null;
  const r = await call("admin-login", "POST", "/api/auth/callback/admin-login", {
    ip: "10.77.250.1",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: [...jar.values()].join("; ") },
    body: new URLSearchParams({ csrfToken: token, email: state.admin.email, password: state.admin.password, callbackUrl: BASE + "/admin/dashboard", json: "true" }).toString(),
  });
  keep(r.setCookie);
  const cookie = [...jar.values()].join("; ");
  return /session-token/.test(cookie) ? cookie : null;
}

async function adminTab(cookie, n) {
  const ip = `10.77.251.${n + 1}`;
  const h = { cookie };
  const loops = [
    [15_000, "admin-badge-counts", "/api/admin/badge-counts"],
    [30_000, "admin-locations", "/api/admin/locations/latest"],
    [60_000, "admin-dashboard-page", "/admin/dashboard"],
  ];
  await Promise.all(
    loops.map(async ([every, label, urlPath]) => {
      await sleep(Math.random() * every);
      while (!stopping) {
        await call(label, "GET", urlPath, { ip, headers: h });
        await sleep(jitter(every));
      }
    }),
  );
}

// ---------- database connection sampler ----------
let dbSamples = [];
async function sampleDb() {
  let Client;
  try {
    ({ Client } = require("pg"));
    require("dotenv").config({ path: path.join(process.cwd(), ".env"), quiet: true });
  } catch {
    return null;
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await c.connect();
    const r = await c.query(`select count(*)::int total, count(*) filter (where state = 'active')::int active
                             from pg_stat_activity where datname = current_database() and usename = 'postgres'`);
    return r.rows[0];
  } catch (e) {
    return { total: -1, active: -1, error: String(e.message).slice(0, 60) };
  } finally {
    await c.end().catch(() => {});
  }
}

// ---------- reporting ----------
const isFailure = (s) => s.status === 0 || s.status >= 500;
const isLimited = (s) => s.status === 429;

function summarize(list) {
  const lat = list.filter((s) => s.status !== 0).map((s) => s.ms).sort((a, b) => a - b);
  const fails = list.filter(isFailure).length;
  const limited = list.filter(isLimited).length;
  const ok = list.filter((s) => s.status >= 200 && s.status < 300).length;
  return { n: list.length, ok, fails, limited, p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat[lat.length - 1] ?? 0 };
}

const csvRows = [["seconds", "stage", "requests", "req_per_s", "p50_ms", "p95_ms", "p99_ms", "failures", "rate_limited", "in_flight", "db_connections", "db_active"]];
let lastIdx = 0;
let lastTick = now();

async function tick() {
  const slice = samples.slice(lastIdx).filter((s) => s.stage !== "setup");
  lastIdx = samples.length;
  const secs = (now() - lastTick) / 1000;
  lastTick = now();
  const w = summarize(slice);
  const db = await sampleDb();
  if (db) dbSamples.push({ t: now(), stage: currentStage, ...db });
  const dbText = db ? (db.total < 0 ? "db: FULL/unreachable" : `db conns ${db.total} (${db.active} busy)`) : "";
  csvRows.push([fmt(now() / 1000), currentStage, w.n, (w.n / secs).toFixed(1), fmt(w.p50), fmt(w.p95), fmt(w.p99), w.fails, w.limited, inflight, db?.total ?? "", db?.active ?? ""]);
  if (currentStage !== "setup") {
    console.log(`[${fmt(now() / 1000).padStart(4)}s] ${String(currentStage).padEnd(14)} ${(w.n / secs).toFixed(1).padStart(6)} req/s  p50 ${fmt(w.p50).padStart(5)}  p95 ${fmt(w.p95).padStart(5)} ms  fail ${w.fails}  429 ${w.limited}  in-flight ${inflight}  ${dbText}`);
  }
  if (w.n >= 20 && !stopping) {
    if (w.fails / w.n > ABORT_ERRORS) abort(`more than ${Math.round(ABORT_ERRORS * 100)}% of requests failed (${w.fails} of ${w.n})`);
    else if (w.p95 > ABORT_P95_MS) abort(`p95 response time ${fmt(w.p95)} ms is over the ${ABORT_P95_MS} ms safety limit`);
  }
}

function abort(reason) {
  abortReason = reason;
  stopping = true;
  console.log(`\n!! STOPPING EARLY to protect the server: ${reason}\n`);
}

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => console.log(line(r)));
}

// What the face check did for the check-ins of this run. "UNAVAILABLE" means the app could not reach the face
// service in time and let the person in anyway - that is how an overloaded face service shows up.
async function faceReport() {
  let Client;
  try {
    ({ Client } = require("pg"));
    require("dotenv").config({ path: path.join(process.cwd(), ".env"), quiet: true });
  } catch {
    return;
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await c.connect();
    const r = await c.query(
      `select a."faceVerifyStatus" as s, count(*)::int as n from "Attendance" a join "User" u on u.id = a."userId"
       where u."organizationId" = $1 and a."timestamp" > now() - interval '3 hours' and a."hasPhoto" = true
       group by 1 order by 1`,
      [state.orgId],
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.s, x.n]));
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    if (!total) return;
    console.log("\nFace check on the check-ins of the last 3 hours:");
    console.log("  " + Object.entries(by).map(([k, v]) => `${k} ${v}`).join("   "));
    if (by.UNAVAILABLE) console.log(`  !! ${by.UNAVAILABLE} check-ins went through WITHOUT a face check because the face service did not answer in time.`);
    if (by.NOT_CHECKED === total) console.log("  (Face verification was not part of this run: the employees were seeded without --face-image.)");
  } catch {
    /* optional extra */
  } finally {
    await c.end().catch(() => {});
  }
}

async function finalReport() {
  const timed = samples.filter((s) => s.stage !== "setup");
  console.log("\n================ RESULT ================");
  console.log(`Scenario: ${SCENARIO}   Target: ${BASE}   Organization: ${state.slug}`);
  if (abortReason) console.log(`ABORTED EARLY: ${abortReason}`);
  console.log(`Peak requests in flight at once: ${maxInflight}`);

  const labels = [...new Set(timed.map((s) => s.label))].sort();
  console.log("\nBy request type (timed part of the run):");
  table(
    labels.map((l) => {
      const s = summarize(timed.filter((x) => x.label === l));
      return [l, s.n, s.ok, s.fails, s.limited, fmt(s.p50), fmt(s.p95), fmt(s.p99), fmt(s.max)];
    }),
    ["request", "count", "ok", "failed", "429", "p50 ms", "p95 ms", "p99 ms", "max ms"],
  );

  const setup = samples.filter((s) => s.stage === "setup");
  if (setup.length) {
    const s = summarize(setup);
    console.log(`\nSetup (logins and first check-ins, ${SETUP_CONCURRENCY} at a time, not part of the verdict): ${s.n} requests, p95 ${fmt(s.p95)} ms, ${s.fails} failed`);
  }

  if (SCENARIO === "steady") {
    console.log(`\nBy stage (pass = p95 under ${SLO_P95_MS} ms, under 1% failed, under 1% rate-limited):`);
    const rows = [];
    let best = null;
    for (const users of STAGES) {
      const id = `${users} users`;
      const list = timed.filter((s) => s.stage === id);
      if (!list.length) {
        rows.push([id, 0, "-", "-", "-", "-", "-", "not reached"]);
        continue;
      }
      const s = summarize(list);
      const secs = Math.max(1, (Math.max(...list.map((x) => x.t)) - Math.min(...list.map((x) => x.t))) / 1000);
      const db = Math.max(0, ...dbSamples.filter((d) => d.stage === id).map((d) => d.total));
      const pass = s.p95 <= SLO_P95_MS && s.fails / s.n < 0.01 && s.limited / s.n < 0.01;
      if (pass) best = users;
      rows.push([id, s.n, (s.n / secs).toFixed(1), fmt(s.p50), fmt(s.p95), `${((100 * s.fails) / s.n).toFixed(1)}%`, db || "-", pass ? "PASS" : "FAIL"]);
    }
    table(rows, ["stage", "requests", "req/s", "p50 ms", "p95 ms", "failed", "db conns max", "verdict"]);
    console.log(best ? `\nHighest stage that passed: ${best} employees online at once.` : "\nNo stage passed.");
    console.log("Check watch.sh output for CPU/memory at that stage before trusting this as a safe limit.");
  } else {
    const label = ACTION === "CHECK_IN" ? "scan-in" : "scan-out";
    const s = summarize(timed.filter((x) => x.label === label));
    const ok = s.ok;
    console.log(`\nRush: ${USERS} employees, ${ACTION}, spread over ${WINDOW_S}s (${SHAPE}).`);
    console.log(`  ${ok} succeeded, ${s.fails} failed, ${s.limited} rate-limited, ${s.n - ok - s.fails - s.limited} other (e.g. already checked in).`);
    console.log(`  ${label} response time: p50 ${fmt(s.p50)} ms, p95 ${fmt(s.p95)} ms, p99 ${fmt(s.p99)} ms, worst ${fmt(s.max)} ms.`);
    const last = Math.max(0, ...timed.filter((x) => x.label === label).map((x) => x.t));
    const first = Math.min(Infinity, ...timed.filter((x) => x.label === label).map((x) => x.t - x.ms));
    if (Number.isFinite(first)) console.log(`  Everyone was done ${fmt((last - first) / 1000)} s after the first request.`);
    console.log(s.p95 <= 5000 && s.fails === 0 ? "  Verdict: the rush was handled (p95 under 5 s, no failures)." : "  Verdict: the rush was NOT handled cleanly.");
  }

  await faceReport();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(OUT_DIR, `${stamp}-${SCENARIO}.csv`);
  fs.writeFileSync(csvPath, csvRows.map((r) => r.join(",")).join("\n") + "\n");
  console.log(`\nTime series saved to ${path.relative(process.cwd(), csvPath)}`);
}

// ---------- scenarios ----------
async function setupEmployees(emps, { checkIn }) {
  console.log(`Setting up ${emps.length} employees (login${checkIn ? " + check-in" : ""}), ${SETUP_CONCURRENCY} at a time...`);
  let done = 0;
  await pool(emps, SETUP_CONCURRENCY, async (e) => {
    const ok = await e.login("setup-login");
    if (ok && checkIn) {
      const r = await e.scan("CHECK_IN", "setup-scan-in");
      if (r.status === 409) await adoptExistingCheckIn(e);
    }
    done += 1;
    if (done % 50 === 0 || done === emps.length) console.log(`  ${done}/${emps.length} ready`);
  });
}

// Already checked in today (an earlier run): the location pings need that check-in's id, so look it up directly.
let existing = null;
async function adoptExistingCheckIn(e) {
  if (!existing) {
    existing = new Map();
    try {
      const { Client } = require("pg");
      require("dotenv").config({ path: path.join(process.cwd(), ".env"), quiet: true });
      const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
      await c.connect();
      const r = await c.query(
        `select a.id, u."employeeCode" as code from "Attendance" a join "User" u on u.id = a."userId"
         where u."organizationId" = $1 and a.type = 'CHECK_IN' and a."timestamp" > now() - interval '30 hours'`,
        [state.orgId],
      );
      r.rows.forEach((row) => existing.set(row.code, row.id));
      await c.end();
    } catch {
      /* pings are then skipped for these employees */
    }
  }
  e.attendanceId = existing.get(e.code) ?? null;
}

async function runSteady(emps) {
  await setupEmployees(emps, { checkIn: PING !== "none" });
  const admins = [];
  if (ADMINS > 0) {
    const cookie = await adminLogin();
    if (!cookie) console.log("!! Admin login failed - admin tabs will be skipped (check the admin e-mail/password in .state.json).");
    else for (let n = 0; n < ADMINS; n++) admins.push(adminTab(cookie, n));
  }
  let active = 0;
  const loops = [];
  for (const users of STAGES) {
    if (stopping) break;
    currentStage = `${users} users`;
    console.log(`\n--- Stage: ${users} employees online, holding ${HOLD_S}s${ADMINS ? ` (+${ADMINS} admin tabs)` : ""} ---`);
    for (; active < users; active++) {
      const e = emps[active];
      const wantsPing = PING === "all" || (PING === "field" && e.workMode === "FIELD");
      loops.push(
        (async () => {
          await sleep(Math.random() * 5000);
          await Promise.all([
            (async () => {
              while (!stopping) {
                await e.status();
                await sleep(jitter(STATUS_EVERY_S * 1000));
              }
            })(),
            (async () => {
              if (!wantsPing) return;
              await sleep(Math.random() * PING_EVERY_S * 1000);
              while (!stopping) {
                await e.ping();
                await sleep(jitter(PING_EVERY_S * 1000));
              }
            })(),
          ]);
        })(),
      );
    }
    const until = now() + HOLD_S * 1000;
    while (now() < until && !stopping) await sleep(500);
  }
  stopping = true;
  await Promise.race([Promise.all([...loops, ...admins]), sleep(TIMEOUT_MS + 2000)]);
}

async function runRush(emps) {
  await setupEmployees(emps, { checkIn: ACTION === "CHECK_OUT" });
  currentStage = "rush";
  const span = WINDOW_S * 1000 * (SHAPE === "burst" ? 0.1 : 1);
  console.log(`\n--- Rush: ${emps.length} employees doing ${ACTION} within ${WINDOW_S}s (${SHAPE}) ---`);
  const jobs = emps.map(async (e) => {
    await sleep(Math.random() * span);
    if (stopping) return;
    await e.status();
    await e.scan(ACTION);
    if (ACTION === "CHECK_IN") await e.status("status-after");
  });
  await Promise.race([Promise.all(jobs), sleep(WINDOW_S * 1000 + TIMEOUT_MS + 5000)]);
  stopping = true;
}

// ---------- main ----------
process.on("SIGINT", () => {
  if (!stopping) abort("stopped with Ctrl+C");
});

console.log(`Load test: ${SCENARIO} against ${BASE} (organization ${state.slug}, ${people.length} employees)`);
console.log(FACE_IMAGE ? `Using the selfie ${FACE_IMAGE} for every check-in...` : `Making a ${PHOTO_KB} KB test photo...`);
const photo = await makePhoto();
console.log(`  photo is ${Math.round(photo.length * 0.75 / 1024)} KB`);
const emps = people.map((p, i) => new Employee(i, p, photo));

const ticker = setInterval(() => void tick(), WINDOW_TICK_MS);
try {
  if (SCENARIO === "steady") await runSteady(emps);
  else await runRush(emps);
} finally {
  clearInterval(ticker);
  await tick();
  await finalReport();
}
process.exit(abortReason ? 2 : 0);
