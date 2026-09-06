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
const db = sql();

const [{ id: runId }] = (await db`insert into runs default values returning id`) as unknown as { id: number }[];

type Row = { app_id: string; name: string; store: string };
/* The apps we actually read, in every storefront we track — not just the
   storefronts that already have reviews. Britain and France start empty and
   fill from here; without this they would never be fetched at all, because the
   list used to be built from the reviews table itself.
   Least recently tried first, so the rotation is even rather than alphabetical. */
const targets = (await db`
  select a.id as app_id, a.name, s.store
  from (select distinct app_id from reviews) r
  join apps a on a.id = r.app_id
  cross join (values ('us'), ('de'), ('gb'), ('fr')) as s(store)
  order by coalesce((select max(f.at) from fetches f
    where f.app_id = a.id and f.store = s.store), '1970-01-01') asc
  limit ${PAIRS}`) as unknown as Row[];

let tried = 0, answered = 0, fresh = 0;
for (const t of targets) {
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
console.log(`run ${runId}: ${answered}/${tried} pages answered, ${fresh} new reviews`);
