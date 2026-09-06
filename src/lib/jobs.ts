import "server-only";
import { lookup } from "@/lib/apple";
import { MODEL, SAMPLE, parseClusters, systemPrompt, userPrompt } from "@/lib/cluster";
import { sql } from "@/lib/db";

/**
 * The daily work, on the site's own cron.
 *
 * `ratings` is the part that always works: Apple's lookup endpoint answers a
 * datacentre address happily, unlike the review feed, which refuses them.
 *
 * `recluster` is deliberately synchronous and deliberately small. The full
 * re-clustering of every app goes through the Batch API from a laptop
 * (scripts/cluster.mts, half price); the cron only touches pairs that gained
 * reviews since they were last read, and Apple's throttle means that is
 * usually none of them.
 */

/**
 * Gives every app without one a unique URL.
 *
 * Runs on the daily cron and after any import. The rule is: the slug a name
 * wants, and if another app already holds it, that slug with the Apple id on
 * the end. Whoever asks first keeps the plain one, so an app's address never
 * changes underneath a link that has already been shared.
 *
 * The uniqueness is the database's, not this function's — a unique index on
 * apps.slug — so two of these running at once cannot both hand out
 * "mcdonald-s". The second insert loses and takes the suffix.
 */
export async function fillSlugs() {
  const db = sql();
  const todo = (await db`
    select id, name from apps where slug is null order by added_at, id
    limit 20000`) as unknown as { id: string; name: string }[];
  let plain = 0;
  let suffixed = 0;
  for (const a of todo) {
    const base =
      a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
      `app-${a.id}`;
    const [got] = (await db`
      update apps set slug = ${base} where id = ${a.id}
        and not exists (select 1 from apps o where o.slug = ${base})
      returning id`) as unknown as { id: string }[];
    if (got) { plain++; continue; }
    await db`update apps set slug = ${`${base}-${a.id}`} where id = ${a.id}`;
    suffixed++;
  }
  return { named: plain + suffixed, plain, suffixed };
}

export async function collectRatings() {
  const db = sql();
  /* A rotation with a budget, because both ends of this job have a ceiling.
   *
   * Apple's lookup endpoint is the tighter one, and it was measured rather
   * than assumed. It answers a datacentre address happily for a few hundred
   * apps. At 45,000 requests from one address it starts refusing: roughly
   * three in four come back 403, and slowing down does not help — five a
   * second and forty a second were refused at the same rate. So this asks a
   * bounded number of questions, retries a refusal once after a pause, and
   * leaves the rest for the next firing.
   *
   * The pairs come from `watch`, not from every app crossed with every
   * storefront. An app that charted only in France is not sold in the United
   * States, and 27,000 of the 47,000 questions the first version asked could
   * never have had an answer.
   *
   * Order of service:
   *   1. pairs whose reviews we have read — every firing, because those are
   *      the pages that show a delta and a delta needs yesterday and today;
   *   2. everything else, longest-untried first, so the whole watchlist comes
   *      round rather than the same thousand apps being refreshed forever.
   *
   * `tried_at` moves whatever Apple answers. A pair Apple refuses must go to
   * the back of the queue too, or it blocks the rotation on the next firing
   * and every firing after that. */
  const BUDGET = Number(process.env.RATINGS_BUDGET ?? 600);
  /* Shards, so four runners can hold four slices of the queue without four
     copies of the same slice. A fresh runner is a fresh address, which is the
     only lever there is against a per-address refusal. Unsharded by default:
     the Vercel cron is one caller and takes the whole ordering. */
  const SHARD = Number(process.env.RATINGS_SHARD ?? 0);
  const SHARDS = Number(process.env.RATINGS_SHARDS ?? 1);
  const rows = (await db`
    select w.app_id, w.store
    from watch w
    where abs(hashtext(w.app_id || '|' || w.store)) % ${SHARDS} = ${SHARD}
    order by exists(select 1 from reviews v where v.app_id = w.app_id) desc,
             w.tried_at asc nulls first, w.app_id, w.store
    limit ${BUDGET}`) as unknown as { app_id: string; store: string }[];
  const day = new Date().toISOString().slice(0, 10);

  let ok = 0;
  let refused = 0;
  let absent = 0;
  let i = 0;
  /* Six at a time. The refusals are not rate-driven, so a bigger number buys
     nothing and only makes the site a worse guest. */
  const workers = Array.from({ length: 6 }, async () => {
    while (i < rows.length) await one(rows[i++]);
  });

  async function one(r: { app_id: string; store: string }) {
    let l = await lookup(r.app_id, r.store);
    if (!l) {
      await new Promise((s) => setTimeout(s, 1500));
      l = await lookup(r.app_id, r.store);
    }
    await db`update watch set tried_at = now()
             where app_id = ${r.app_id} and store = ${r.store}`;
    if (!l) {
      /* Refused or not sold there — indistinguishable from here, and both mean
         the same thing to the site: no score today. Nothing is written, so a
         score we already hold stays on the page instead of being replaced by a
         blank. */
      refused++;
      return;
    }
    if (l.artwork) await db`update apps set artwork = ${l.artwork} where id = ${r.app_id}`;
    if (l.average == null) { absent++; return; }
    await db`
      insert into ratings (app_id, store, day, average, count, version, released_at)
      values (${r.app_id}, ${r.store}, ${day}, ${l.average}, ${l.count}, ${l.version},
              ${l.released_at ? new Date(l.released_at).toISOString() : null})
      on conflict (app_id, store, day) do update set
        average = excluded.average, count = excluded.count,
        version = excluded.version, released_at = excluded.released_at, at = now()`;
    ok++;
  }

  await Promise.all(workers);

  /* Keep thirty days and drop the rest. The site shows today and yesterday and
     /today needs both. The database is half a gigabyte and a year of history
     nobody reads would fill it. */
  await db`delete from ratings
           where day < ${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}`;

  const [{ pairs, behind }] = (await db`
    select count(*)::int as pairs,
           count(*) filter (where tried_at is null or tried_at < now() - interval '1 day')::int as behind
    from watch`) as unknown as { pairs: number; behind: number }[];
  return { asked: rows.length, stored: ok, refused, absent, pairs, behind, day };
}

async function clusterOne(app_id: string, name: string, store: string, runId: number) {
  const db = sql();
  const rows = (await db`
    select review_id, title, body, rating from reviews
    where app_id = ${app_id} and store = ${store} and rating <= 2
    order by seq asc limit ${SAMPLE}`) as unknown as
    { review_id: string; title: string; body: string; rating: number }[];
  if (rows.length < 12) return 0;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(name, store, rows) }],
    }),
  });
  if (!res.ok) return 0;
  const msg = (await res.json()) as { content?: { text?: string }[] };
  const clusters = parseClusters((msg.content ?? []).map((b) => b.text ?? "").join(""));
  if (!clusters.length) return 0;

  await db`delete from clusters where app_id = ${app_id} and store = ${store}`;
  let wrote = 0;
  for (const c of clusters) {
    const members = [...new Set(c.members)].filter((m) => m >= 1 && m <= rows.length);
    if (members.length < 3) continue;
    const [prev] = (await db`
      select first_run from clusters where app_id = ${app_id} and store = ${store} and key = ${c.key} limit 1`) as unknown as { first_run: number }[];
    await db`
      insert into clusters (app_id, store, key, label, blurb, n, share, quotes, first_run, run_id)
      values (${app_id}, ${store}, ${c.key}, ${c.label.slice(0, 120)}, ${c.blurb.slice(0, 300)},
              ${members.length}, ${members.length / rows.length},
              ${JSON.stringify(members.slice(0, 3).map((m) => rows[m - 1].review_id))}::jsonb,
              ${prev?.first_run ?? runId}, ${runId})`;
    wrote++;
  }
  return wrote;
}

/** Re-reads only what gained reviews since it was last read. */
export async function reclusterStale(limit = 8) {
  const db = sql();
  const stale = (await db`
    select r.app_id, a.name, r.store, count(*)::int as fresh
    from reviews r join apps a on a.id = r.app_id
    where r.rating <= 2
      and r.first_seen > coalesce(
        (select max(c.at) from clusters c where c.app_id = r.app_id and c.store = r.store),
        '1970-01-01')
    group by r.app_id, a.name, r.store
    /* Both halves matter. Three new reviews is enough to be worth re-reading;
       twelve negatives in total is the threshold clusterOne needs to say
       anything at all. Without the second, a pair with ten reviews is picked
       as stale every single morning, does nothing, and crowds out a pair that
       could have been re-read. */
    having count(*) >= 3
       and (select count(*) from reviews x
            where x.app_id = r.app_id and x.store = r.store and x.rating <= 2) >= 12
    order by count(*) desc
    limit ${limit}`) as unknown as { app_id: string; name: string; store: string; fresh: number }[];
  if (!stale.length) return { pairs: 0, clusters: 0 };

  const [{ id: runId }] = (await db`
    insert into runs (finished_at, clustered) values (now(), ${stale.length}) returning id`) as unknown as { id: number }[];
  let wrote = 0;
  for (const s of stale) wrote += await clusterOne(s.app_id, s.name, s.store, runId);
  return { pairs: stale.length, clusters: wrote, run: runId };
}
