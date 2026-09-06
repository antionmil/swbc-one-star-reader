/**
 * Translates the reviews the site actually quotes.
 *
 * Only the quoted ones, and only from the storefronts that are not English:
 * translating 17,000 reviews to show 900 of them would be paying for work
 * nobody reads. A review that turns out to be English already is stored as
 * itself with lang "en", so it is never sent twice.
 *
 * Batch API, so half price and nobody waiting.
 */
import { sql } from "../src/lib/db";
import { clean } from "../src/lib/cluster";

process.loadEnvFile(".env.local");
const KEY = process.env.ANTHROPIC_API_KEY!;
const API = "https://api.anthropic.com/v1";
const H = { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" };
const db = sql();

type Row = { review_id: string; app_id: string; store: string; title: string; body: string };
const rows = (await db`
  select r.review_id, r.app_id, r.store, r.title, r.body
  from reviews r
  where r.title_en is null
    and r.store <> 'us'
    and r.review_id in (select jsonb_array_elements_text(quotes) from clusters)
  limit 1500`) as unknown as Row[];

console.log(`${rows.length} quoted reviews to translate`);
if (!rows.length) process.exit(0);

const SYSTEM = [
  "You translate App Store reviews into English.",
  "",
  "Rules:",
  "1. Keep the reviewer's register. An angry review stays angry; slang stays slang. Do not tidy it up or make it polite.",
  "2. Translate exactly what is there. Never explain, summarise or add.",
  "3. If the text is already English, return it unchanged.",
  '4. Answer with JSON only: {"lang":"de","title":"...","body":"..."} where lang is the ISO code of the ORIGINAL.',
].join("\n");

const requests = rows.map((r) => ({
  custom_id: `${r.app_id}__${r.store}__${r.review_id}`.slice(0, 60),
  params: {
    model: "claude-haiku-4-5",
    max_tokens: 900,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Title: ${clean(r.title).slice(0, 300)}\nBody: ${clean(r.body).slice(0, 1200)}`,
      },
    ],
  },
}));

const byId = new Map(rows.map((r) => [`${r.app_id}__${r.store}__${r.review_id}`.slice(0, 60), r]));

const created = await (await fetch(`${API}/messages/batches`, {
  method: "POST", headers: H, body: JSON.stringify({ requests }),
})).json();
if (!created.id) { console.error("batch not created:", JSON.stringify(created).slice(0, 300)); process.exit(1); }
console.log(`batch ${created.id} submitted`);

let status = created;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 15_000));
  status = await (await fetch(`${API}/messages/batches/${created.id}`, { headers: H })).json();
  const c = status.request_counts ?? {};
  process.stdout.write(`  ${status.processing_status} succeeded=${c.succeeded ?? 0} errored=${c.errored ?? 0}   \r`);
  if (status.processing_status === "ended") break;
}
console.log();

const text = await (await fetch(status.results_url, { headers: H })).text();
let ok = 0, inTok = 0, outTok = 0;
for (const line of text.trim().split("\n")) {
  const res = JSON.parse(line);
  const row = byId.get(res.custom_id);
  if (!row || res.result?.type !== "succeeded") continue;
  const msg = res.result.message;
  inTok += msg.usage?.input_tokens ?? 0;
  outTok += msg.usage?.output_tokens ?? 0;
  const raw = msg.content.map((b: { text?: string }) => b.text ?? "").join("").trim();
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) continue;
  try {
    const d = JSON.parse(raw.slice(start, end + 1)) as { lang?: string; title?: string; body?: string };
    await db`
      update reviews set lang = ${d.lang ?? row.store}, title_en = ${(d.title ?? row.title).slice(0, 400)},
        body_en = ${(d.body ?? row.body).slice(0, 2000)}
      where app_id = ${row.app_id} and store = ${row.store} and review_id = ${row.review_id}`;
    ok++;
  } catch { /* one unparseable answer is not worth failing the batch over */ }
}
const cost = (inTok / 1e6) * 0.5 + (outTok / 1e6) * 2.5;
console.log(`${ok} translated · ${inTok.toLocaleString()} in, ${outTok.toLocaleString()} out — $${cost.toFixed(2)} at batch rates`);
