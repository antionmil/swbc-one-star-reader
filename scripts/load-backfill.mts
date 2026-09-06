/**
 * Loads the prep corpus into the database. Idempotent.
 *
 * The prep script kept only the rating, the title and the body — no review id
 * and no date. So a backfilled row gets a synthetic id, the hash of its own
 * text, which is stable across re-runs and collapses exact duplicates. Their
 * `written_at` stays NULL, and that is deliberate: the site can then say
 * "collected 31.08, Apple did not tell us when it was written" instead of
 * inventing a date. Everything the cron fetches from here on carries Apple's
 * own id and timestamp.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "../src/lib/db";

/* A GitHub runner has no .env.local; it gets the secrets from the environment.
   Demanding the file made every sharded run exit 1 before it asked Apple
   anything. */
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.local"); } catch { /* CI passes it in */ }
}

type Raw = {
  apps: { id: string; name: string; genre: string | null; reviews: Record<string, { rating: number; title: string; body: string }[]> }[];
  storefronts: string[];
};

const raw = JSON.parse(readFileSync("../prep/watchlist.json", "utf8")) as Raw;
const db = sql();
const PREP_DAY = "2026-08-31";

let apps = 0, rows = 0;
for (const a of raw.apps) {
  await db`
    insert into apps (id, name, genre) values (${a.id}, ${a.name}, ${a.genre})
    on conflict (id) do update set name = excluded.name, genre = excluded.genre`;
  apps++;

  for (const [store, list] of Object.entries(a.reviews)) {
    /* Two identical reviews in one page share a synthetic id, and Postgres
       refuses an ON CONFLICT DO UPDATE that touches the same row twice in one
       statement. The first occurrence wins, which is the most recent one. */
    const seen = new Set<string>();
    const buf = list
      .map((r, i) => ({
        seq: i,
        review_id: "bf_" + createHash("sha1").update(`${a.id}|${store}|${r.title}|${r.body}`).digest("hex").slice(0, 16),
        rating: r.rating,
        title: r.title.slice(0, 400),
        body: r.body.slice(0, 2000),
      }))
      .filter((r) => !seen.has(r.review_id) && seen.add(r.review_id));
    for (let i = 0; i < buf.length; i += 300) {
      const c = buf.slice(i, i + 300);
      await db`
        insert into reviews (app_id, store, review_id, rating, title, body, seq, first_seen)
        select ${a.id}, ${store}, * , ${PREP_DAY}::timestamptz from unnest(
          ${c.map((r) => r.review_id)}::text[],
          ${c.map((r) => r.rating)}::int[],
          ${c.map((r) => r.title)}::text[],
          ${c.map((r) => r.body)}::text[],
          ${c.map((r) => r.seq)}::int[])
        on conflict (app_id, store, review_id) do update set seq = excluded.seq`;
      rows += c.length;
    }
  }
  process.stdout.write(`  ${a.name.slice(0, 28).padEnd(30)} ${rows}\r`);
}

const [{ n }] = (await db`select count(*)::int as n from reviews`) as unknown as { n: number }[];
const [{ neg }] = (await db`select count(*)::int as neg from reviews where rating <= 2`) as unknown as { neg: number }[];
console.log(`\n${apps} apps, ${rows} rows offered, ${n} reviews stored, ${neg} of them negative`);
