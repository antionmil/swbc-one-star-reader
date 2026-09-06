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
/* The number of one- and two-star reviews a pair needs before it is allowed to
   be grouped into complaints. Same figure as src/lib/cluster.ts uses. */
const FLOOR = 12;
const db = sql();

const [{ id: runId }] = (await db`insert into runs default values returning id`) as unknown as { id: number }[];

type Row = {
  app_id: string; name: string; store: string;
  /** One- and two-star reviews already held for this pair. */
  neg: number;
  /** The deepest page of this pair we have ever asked for. */
  deepest: number;
};
/* Who gets read, and in what order.
 *
 * The site had twenty readable apps for two days and the reason was here: this
 * asked for apps that already had reviews, so the only apps it ever read were
 * the ones it had already read. The watchlist grew to 11,798 and the shelf
 * stayed at twenty.
 *
 * Apple lets through roughly one review page per address every ten minutes.
 * Four runners on a quarter-hour schedule is about 150 answered pages an hour,
 * and a badly-rated app needs two or three of them before it has the twelve
 * negative reviews a complaint group is allowed to be built from. So this can
 * open perhaps a thousand new app/storefront pairs a day, and it has to spend
 * that budget deliberately rather than alphabetically.
 *
 * Half the runners widen, half refresh, decided by the shard index:
 *
 *   WIDEN (even shards)   apps nobody has read yet, most-rated first, so the
 *                         names a reader recognises arrive before the long
 *                         tail. A person asking for their own app jumps this
 *                         queue — that is the only queue on this site somebody
 *                         is actually waiting in.
 *
 *   REFRESH (odd shards)  pairs we already publish complaints for, longest
 *                         since last tried. Without this the front page goes
 *                         stale the moment the watchlist gets interesting.
 *
 * Neither half can starve the other, and neither depends on the other
 * finishing. */
const WIDEN = SHARD % 2 === 0;
const limit = PAIRS * SHARDS;
/* Two whole queries rather than one with a flag in it. A boolean cannot be
   interpolated into a tagged template as SQL — it arrives as a parameter — and
   a half-built predicate is the kind of thing that runs, returns rows, and
   quietly reads the wrong half of the watchlist. */
const targets = (WIDEN
  ? await db`
      select a.id as app_id, a.name, w.store, 0 as neg, 0 as deepest
      from watch w join apps a on a.id = w.app_id
      where not exists (select 1 from reviews v
                        where v.app_id = a.id and v.store = w.store)
      order by exists (select 1 from requests q where q.app_id = a.id) desc,
               coalesce((select max(f.at) from fetches f
                 where f.app_id = a.id and f.store = w.store), '1970-01-01') asc,
               coalesce((select max(r.count) from ratings r
                 where r.app_id = a.id and r.store = w.store), 0) desc
      limit ${limit}`
  : await db`
      select a.id as app_id, a.name, w.store,
             (select count(*)::int from reviews v
              where v.app_id = a.id and v.store = w.store and v.rating <= 2) as neg,
             coalesce((select max(f.page)::int from fetches f
              where f.app_id = a.id and f.store = w.store), 0) as deepest
      from watch w join apps a on a.id = w.app_id
      where exists (select 1 from reviews v
                    where v.app_id = a.id and v.store = w.store)
      order by exists (select 1 from requests q where q.app_id = a.id) desc,
               coalesce((select max(f.at) from fetches f
                 where f.app_id = a.id and f.store = w.store), '1970-01-01') asc
      limit ${limit}`) as unknown as Row[];

/* Every SHARDS-th row, offset by this runner's index. */
const mine = targets.filter((_, i) => i % SHARDS === SHARD);

let tried = 0, answered = 0, fresh = 0;
for (const t of mine) {
  if (tried) await new Promise((r) => setTimeout(r, GAP_MS));
  tried++;
  /* Which page, and this matters more than it looks.
   *
   * This asked for page 1 every time, for every pair, forever. A new app
   * therefore got fifty reviews once — perhaps eight of them one or two star,
   * under the twelve a complaint group needs — and then sat at eight for good,
   * because every later visit re-read the same fifty.
   *
   * So: a pair that cannot be published yet goes DEEPER, one page each visit,
   * up to Apple's ten-page ceiling. A pair that can be published goes back to
   * page 1, where the newest reviews are, and stays current. */
  const page = t.neg >= FLOOR ? 1 : Math.min(t.deepest + 1, 10);
  const got_page = await fetchPage(t.app_id, t.store, page);
  const got = got_page?.length ?? 0;
  let newOnes = 0;

  if (got) {
    answered++;
    const before = (await db`
      select count(*)::int as n from reviews where app_id = ${t.app_id} and store = ${t.store}`) as unknown as { n: number }[];
    await db`
      insert into reviews (app_id, store, review_id, rating, title, body, version, written_at)
      select ${t.app_id}, ${t.store}, * from unnest(
        ${got_page!.map((r) => r.review_id)}::text[],
        ${got_page!.map((r) => r.rating)}::int[],
        ${got_page!.map((r) => r.title)}::text[],
        ${got_page!.map((r) => r.body)}::text[],
        ${got_page!.map((r) => r.version)}::text[],
        ${got_page!.map((r) => r.written_at)}::timestamptz[])
      on conflict (app_id, store, review_id) do nothing`;
    const after = (await db`
      select count(*)::int as n from reviews where app_id = ${t.app_id} and store = ${t.store}`) as unknown as { n: number }[];
    newOnes = after[0].n - before[0].n;
    fresh += newOnes;
  }

  await db`
    insert into fetches (run_id, app_id, store, page, got, fresh)
    values (${runId}, ${t.app_id}, ${t.store}, ${page}, ${got}, ${newOnes})`;
  console.log(`  ${t.name.slice(0, 24).padEnd(26)} ${t.store} p${page}  got=${String(got).padStart(2)}  new=${newOnes}`);
}

await db`
  update runs set finished_at = now(), pages_tried = ${tried},
    pages_answered = ${answered}, new_reviews = ${fresh} where id = ${runId}`;
console.log(`run ${runId} (shard ${SHARD + 1}/${SHARDS}): ${answered}/${tried} pages answered, ${fresh} new reviews`);
