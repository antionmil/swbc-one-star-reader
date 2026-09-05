/**
 * The cron gate, tested by attempting what it exists to stop.
 *
 * Day 1 of this run shipped a rate limiter that compiled, deployed and did
 * nothing. Anything meant to PREVENT something has to be fired at.
 *
 * Usage: pnpm qa:cron <base-url>
 */
const base = process.argv[2] ?? "http://localhost:3000";
let failures = 0;

async function expect(label: string, url: string, init: RequestInit, want: number) {
  const r = await fetch(url, init);
  const pass = r.status === want;
  if (!pass) failures++;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label.padEnd(44)} want ${want}, got ${r.status}`);
}

console.log(`firing at ${base}\n`);
await expect("no Authorization header", `${base}/api/cron/daily`, {}, 401);
await expect("wrong secret", `${base}/api/cron/daily`, { headers: { authorization: "Bearer nope" } }, 401);
await expect("unknown job, wrong secret", `${base}/api/cron/nope`, { headers: { authorization: "Bearer nope" } }, 401);
await expect("secret in a query string", `${base}/api/cron/daily?secret=x`, {}, 401);

console.log(failures === 0 ? "\ncron gate: PASS — every unauthorised shape was refused" : `\ncron gate: ${failures} FAILURES`);
process.exitCode = failures === 0 ? 0 : 1;
