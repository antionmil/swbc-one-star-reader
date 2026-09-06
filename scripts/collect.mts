/**
 * The collector. Runs on GitHub Actions, not on Vercel.
 *
 * WHY NOT ON VERCEL. Apple throttles this feed to about one page per address
 * per ten minutes and answers a throttled request with an empty 200. A Vercel
 * cron is one address and, on the Hobby plan, one firing a day — which buys
 * one page of reviews a day for a twenty-app watchlist. A scheduled Action
 * gets a fresh runner, and a fresh address, every firing.
 *
 * It takes the pairs that were fetched longest ago, so the watchlist is walked
 * evenly rather than the first apps being fresh and the last never touched.
 */
import { fetchPage } from "../src/lib/apple";
import { sql } from "../src/lib/db";

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.local"); } catch { /* CI passes it in the environment */ }
}

const PAIRS = Number(process.env.COLLECT_PAIRS ?? 6);
const GAP_MS = Number(process.env.COLLECT_GAP_MS ?? 20_000);
/* Which slice of the queue this runner takes. The workflow starts several jobs
   at once, each on its own runner and so its own address, and each takes a
   different slice — otherwise four runners would race for the same six pages. */
const SHARD = Number(process.env.COLLECT_SHARD ?? 0);
const SHARDS = Number(process.env.COLLECT_SHARDS ?? 1);
const db = sql();

const [{ id: runId }] = (await db`insert into runs default values returning id`) as unknown as { id: number }[];

type Row = { app_id: string; name: string; store: string };
/* Who gets read, and in what order.
 *
 * Two kinds of app qualify: one somebody asked for, and one we have already
 * read. Nothing else — the watchlist is 11,798 apps and Apple lets through
 * about six review pages an hour, so reading the charts at random would mean
 * one page each and a complaint for nobody.
 *
 * A requested app that has never been read goes first, always. That is the
 * whole promise of the request box, and it is the only queue on this site a
 * person is actually waiting in. After that, least recently tried, so the
 * rotation is even rather than alphabetical.
 *
 * Storefronts come from `watch` rather than from a cross join: a requested app
 * is watched in all four, a charted one only where it charted, and an app we
 * have read keeps every storefront it has reviews in. */
const targets = (await db`
  select a.id as app_id, a.name, w.store
  from watch w
  join apps a on a.id = w.app_id
  where exists (select 1 from requests q where q.app_id = a.id)
     or exists (select 1 from reviews v where v.app_id = a.id)
  order by (not exists (select 1 from reviews v where v.app_id = a.id)) desc,
           coalesce((select max(f.at) from fetches f
             where f.app_id = a.id and f.store = w.store), '1970-01-01') asc
  limit ${PAIRS * SHARDS}`) as unknown as Row[];

/* Every SHARDS-th row, offset by this runner's index. */
const mine = targets.filter((_, i) => i % SHARDS === SHARD);

let tried = 0, answered = 0, fresh = 0;
for (const t of mine) {
  if (tried) await new Promise((r) => setTimeout(r, GAP_MS));
  tried++;
  const page = await fetchPage(t.app_id, t.store, 1);
  const got = page?.length ?? 0;
  let newOnes = 0;

  if (got) {
    answered++;
    const before = (await db`
      select count(*)::int as n from reviews where app_id = ${t.app_id} and store = ${t.store}`) as unknown as { n: number }[];
    await db`
      insert into reviews (app_id, store, review_id, rating, title, body, version, written_at)
      select ${t.app_id}, ${t.store}, * from unnest(
        ${page!.map((r) => r.review_id)}::text[],
        ${page!.map((r) => r.rating)}::int[],
        ${page!.map((r) => r.title)}::text[],
        ${page!.map((r) => r.body)}::text[],
        ${page!.map((r) => r.version)}::text[],
        ${page!.map((r) => r.written_at)}::timestamptz[])
      on conflict (app_id, store, review_id) do nothing`;
    const after = (await db`
      select count(*)::int as n from reviews where app_id = ${t.app_id} and store = ${t.store}`) as unknown as { n: number }[];
    newOnes = after[0].n - before[0].n;
    fresh += newOnes;
  }

  await db`
    insert into fetches (run_id, app_id, store, page, got, fresh)
    values (${runId}, ${t.app_id}, ${t.store}, 1, ${got}, ${newOnes})`;
  console.log(`  ${t.name.slice(0, 24).padEnd(26)} ${t.store}  got=${String(got).padStart(2)}  new=${newOnes}`);
}

await db`
  update runs set finished_at = now(), pages_tried = ${tried},
    pages_answered = ${answered}, new_reviews = ${fresh} where id = ${runId}`;
console.log(`run ${runId} (shard ${SHARD + 1}/${SHARDS}): ${answered}/${tried} pages answered, ${fresh} new reviews`);
