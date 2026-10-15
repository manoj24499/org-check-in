# Load test kit

Answers: **how many employees can use the app at the same time on this server, and what breaks first.**

It talks to the running app directly on the server (`http://localhost:3000`), with a throwaway organization
called `loadtest-xxxxxx` full of fake employees. No real organization or employee is touched, and everything is
deleted at the end.

| File | What it does |
|---|---|
| `seed.cjs` | Creates, resets and deletes the throwaway organization (`up`, `reset`, `down`). |
| `run.mjs` | The test itself: `steady` (how many at once) and `rush` (everyone checks in together). |
| `watch.sh` | Records server CPU, memory and app memory every 5 seconds while a test runs. |

## Read this first
- The test runs against the **real production app process and the real production database**. The fake
  organization lives in the same database as your real data, and the connection pool (15 connections,
  shared by everything) is shared too. Run it **outside working hours**, and tell the team.
- The test stops itself if more than 25% of requests fail, or response times pass 15 seconds
  (`--abort-p95`, `--abort-errors`). Ctrl+C also stops it cleanly.
- **Face verification is included when you give the kit a selfie** (see "Including face verification" below). Without
  one, the fake employees have face verification switched off and the test shows the app alone. Because face
  matching is heavy on the CPU, always run the real test with it on if the face service shares this machine.
- Run everything from the project folder (`~/projects/org-check-in`), on the server.

## Steps (on the server)

**1. Get the files**
```bash
git pull
```

**2. Create the test organization** (300 employees: 70% office, 20% work from home, 10% field)
```bash
node loadtest/seed.cjs up --employees 300
```

**3. Start the server monitor** in a second SSH window, and leave it running
```bash
bash loadtest/watch.sh
```

**4. Test A, how many employees online at once.** Takes about 8 to 10 minutes.
```bash
node loadtest/run.mjs --scenario steady --stages 50,100,200,300 --hold 120 --admins 3
```
Each employee has the app open: a status check every 30 s and a location ping every 60 s (this is the
worst case, everyone pinging). The three admin tabs refresh every 15 s like a real dashboard. It prints one
line every 10 seconds and a table at the end showing which stage passed.

**5. Test B, the morning rush.** Reset first, so people can check in again.
```bash
node loadtest/seed.cjs reset
node loadtest/run.mjs --scenario rush --users 300 --window 60
```
Make it harsher or gentler with `--window 20` (very sharp) or `--window 300` (spread over 5 minutes).
For the evening rush (everyone checking out), run the check-in first, then:
```bash
node loadtest/run.mjs --scenario rush --users 300 --window 60 --action CHECK_OUT
```
Run `seed.cjs reset` between repeats of the same check-in test.

**6. Clean up** (also stop `watch.sh` with Ctrl+C)
```bash
node loadtest/seed.cjs down
```
If a run was interrupted and you are not sure, `node loadtest/seed.cjs down --all` removes every
`loadtest-*` organization (and nothing else).

Results are saved in `loadtest/results/` (not committed): one file per test run, and one from `watch.sh`.

## Including face verification
The app sends every check-in selfie to the face service, which compares it with the employee's saved face.
To test that for real, give the kit **one clear photo of a face** (a normal selfie, JPEG, for example your own).
It is saved as the "reference face" for all fake employees and is also the photo they check in with. Keep the
file on the server only, it is not committed (`*.jpg` is ignored in this folder).

```bash
node loadtest/seed.cjs up --employees 300 --face-image ~/selfie.jpg
node loadtest/run.mjs --scenario steady --stages 50,100,200,300 --hold 120 --admins 3 --face-image ~/selfie.jpg
node loadtest/seed.cjs reset
node loadtest/run.mjs --scenario rush --users 300 --window 60 --face-image ~/selfie.jpg
```
Enrolling 300 faces takes a minute or two (it uses `FACE_VERIFY_URL` from `.env`). `seed.cjs down` removes
those 300 saved faces from the face service again, so nothing is left behind.

**The result to look for:** at the end of each run the report prints the face check totals, for example
`MATCHED 287   UNAVAILABLE 13`. **`UNAVAILABLE` is the important one.** If the face service does not answer within
`FACE_VERIFY_TIMEOUT_MS` (5 seconds by default), the app lets the person check in **without** a face check and
records it as unavailable. So an overloaded face service does not show up as errors, it shows up as quietly skipped
checks. Any number above zero means the machine could not keep up at that load.

If the face service runs on the same machine, `watch.sh` also shows it: the `top3_cpu` column lists the three
busiest processes, and the face service (a Python/uvicorn process) will appear there during the rush. It and the
app compete for the same 4 CPUs.

## How to read the result
- **Steady table:** a stage passes when the slowest 5% of requests (p95) finish under 2 seconds with under 1%
  failures. The last passing stage is your comfortable limit for employees online at once. Stay
  well under it, it is not a safe maximum.
- **Rush verdict:** handled if the slowest 5% (p95) of check-ins take under 5 seconds with no failures.
- **`db conns`:** how many of Supabase's 15 pooled connections are in use. If it sits at 14 to 15 and
  requests slow down, the database connection pool is the limit.
- **`watch.sh` CPU:** if `app_cpu_pct` sits near 100 while total CPU is only about 25% (1 of 4 cores), the single app process
  is the limit, and running it as 4 processes (pm2 cluster mode) is the fix.
- **429 column:** requests refused by the app's own rate limits. A few are expected only when a limit is hit
  on purpose. Many mean a limit is too tight for this load.

## Options you may want
`--users`, `--window`, `--stages 25,50,100`, `--hold 60`, `--admins 5`, `--ping none|field|all`,
`--status-every 30`, `--ping-every 60`, `--slo-p95 2000`, `--photo-kb 70`, `--offset 100` (use a different
slice of employees, for running two tests at once).
