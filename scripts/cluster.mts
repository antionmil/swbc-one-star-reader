/**
 * Clusters every app+storefront with the Batch API. Half price, and nobody is
 * waiting: the site reads what this writes, it never calls a model itself.
 *
 *   pnpm cluster            re-cluster everything
 *   pnpm cluster --stale    only pairs with new reviews since their last run
 */
import { sql } from "../src/lib/db";
import { MODEL, SAMPLE, parseClusters, systemPrompt, userPrompt } from "../src/lib/cluster";

process.loadEnvFile(".env.local");
const KEY = process.env.ANTHROPIC_API_KEY!;
const API = "https://api.anthropic.com/v1";
const H = { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" };

const db = sql();
const onlyStale = process.argv.includes("--stale");

type Pair = { app_id: string; name: string; store: string; n: number };
const pairs = (await db`
  select r.app_id, a.name, r.store, count(*)::int as n
  from reviews r join apps a on a.id = r.app_id
  where r.rating <= 2
  group by r.app_id, a.name, r.store
  having count(*) >= 12
  order by a.name, r.store`) as unknown as Pair[];

const todo: Pair[] = [];
for (const p of pairs) {
  if (!onlyStale) { todo.push(p); continue; }
  const [row] = (await db`
    select count(*)::int as n from reviews r
    where r.app_id = ${p.app_id} and r.store = ${p.store} and r.rating <= 2
      and r.first_seen > coalesce((select max(at) from clusters c
        where c.app_id = r.app_id and c.store = r.store), '1970-01-01')`) as unknown as { n: number }[];
  if (row.n > 0) todo.push(p);
}
console.log(`${todo.length} app/storefront pairs to cluster (of ${pairs.length})`);
if (!todo.length) process.exit(0);

/* Build one request per pair. The review index in the prompt maps back to a
   real review id here, so a quote can never be something the model wrote. */
const index = new Map<string, { review_id: string; title: string; body: string; rating: number }[]>();
const requests = [];
for (const p of todo) {
  const rows = (await db`
    select review_id, title, body, rating from reviews
    where app_id = ${p.app_id} and store = ${p.store} and rating <= 2
    order by seq asc limit ${SAMPLE}`) as unknown as { review_id: string; title: string; body: string; rating: number }[];
  const id = `${p.app_id}__${p.store}`;
  index.set(id, rows);
  requests.push({
    custom_id: id,
    params: {
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(p.name, p.store, rows) }],
    },
  });
}

const created = await (await fetch(`${API}/messages/batches`, {
  method: "POST", headers: H, body: JSON.stringify({ requests }),
})).json();
if (!created.id) { console.error("batch not created:", JSON.stringify(created).slice(0, 400)); process.exit(1); }
console.log(`batch ${created.id} submitted with ${requests.length} requests`);

let status = created;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  status = await (await fetch(`${API}/messages/batches/${created.id}`, { headers: H })).json();
  const c = status.request_counts ?? {};
  process.stdout.write(`  ${status.processing_status}  succeeded=${c.succeeded ?? 0} errored=${c.errored ?? 0} processing=${c.processing ?? 0}   \r`);
  if (status.processing_status === "ended") break;
}
console.log();
if (status.processing_status !== "ended") { console.error("batch did not finish in an hour"); process.exit(1); }

const [{ id: runId }] = (await db`
  insert into runs (finished_at, clustered) values (now(), ${todo.length}) returning id`) as unknown as { id: number }[];

const text = await (await fetch(status.results_url, { headers: H })).text();
let ok = 0, empty = 0, inTok = 0, outTok = 0;
for (const line of text.trim().split("\n")) {
  const res = JSON.parse(line);
  const [app_id, store] = res.custom_id.split("__");
  if (res.result?.type !== "succeeded") { empty++; continue; }
  const msg = res.result.message;
  inTok += msg.usage?.input_tokens ?? 0;
  outTok += msg.usage?.output_tokens ?? 0;
  const rows = index.get(res.custom_id)!;
  const clusters = parseClusters(msg.content.map((b: { text?: string }) => b.text ?? "").join(""));
  if (!clusters.length) { empty++; continue; }

  await db`delete from clusters where app_id = ${app_id} and store = ${store}`;
  for (const c of clusters) {
    const members = [...new Set(c.members)].filter((m) => m >= 1 && m <= rows.length);
    if (members.length < 3) continue;
    const quotes = members.slice(0, 3).map((m) => rows[m - 1].review_id);
    /* first_run keeps the day a complaint first appeared, so "new since
       yesterday" survives a re-cluster that happens to reword the label. */
    const [prev] = (await db`
      select first_run from clusters where app_id = ${app_id} and store = ${store} and key = ${c.key} limit 1`) as unknown as { first_run: number }[];
    await db`
      insert into clusters (app_id, store, key, label, blurb, n, share, quotes, first_run, run_id)
      values (${app_id}, ${store}, ${c.key}, ${c.label.slice(0, 120)}, ${c.blurb.slice(0, 300)},
              ${members.length}, ${members.length / rows.length}, ${JSON.stringify(quotes)}::jsonb,
              ${prev?.first_run ?? runId}, ${runId})`;
  }
  ok++;
}
const cost = (inTok / 1e6) * 1.0 * 0.5 + (outTok / 1e6) * 5.0 * 0.5;
console.log(`run ${runId}: ${ok} clustered, ${empty} produced nothing`);
console.log(`tokens: ${inTok.toLocaleString()} in, ${outTok.toLocaleString()} out — $${cost.toFixed(2)} at batch rates`);
