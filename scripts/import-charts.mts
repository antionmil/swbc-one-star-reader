/**
 * Imports every app in Apple's top free, paid and grossing charts for both
 * storefronts, and reads each one's rating, version and icon.
 *
 * These are WATCHED, not read: the lookup endpoint answers from anywhere, so a
 * rating is instant and free, while the review feed is throttled to roughly one
 * page per address per ten minutes and refuses datacentre addresses outright.
 * An app here shows what Apple says about it and an honest "reviews not read
 * yet" until a collector reaches it.
 */
import { lookup } from "../src/lib/apple";
import { sql } from "../src/lib/db";

process.loadEnvFile(".env.local");
const db = sql();
const STORES = ["us", "de"] as const;
const CHARTS = ["topfreeapplications", "toppaidapplications", "topgrossingapplications"] as const;

const found = new Map<string, { name: string; genre: string | null }>();
for (const store of STORES) {
  for (const chart of CHARTS) {
    const res = await fetch(`https://itunes.apple.com/${store}/rss/${chart}/limit=100/json`, {
      headers: { "user-agent": "onestarreader.onedaybuilt.com (+one website a day)" },
    });
    if (!res.ok) { console.log(`  ${store}/${chart}: HTTP ${res.status}`); continue; }
    const d = (await res.json()) as { feed?: { entry?: Record<string, { attributes?: Record<string, string>; label?: string }>[] } };
    const entries = d.feed?.entry ?? [];
    for (const e of entries) {
      const id = e.id?.attributes?.["im:id"];
      if (!id) continue;
      found.set(id, { name: e["im:name"]?.label ?? id, genre: e.category?.attributes?.label ?? null });
    }
    console.log(`  ${store}/${chart}: ${entries.length}`);
  }
}
console.log(`${found.size} distinct apps in the charts`);

const existing = new Set(((await db`select id from apps`) as unknown as { id: string }[]).map((r) => r.id));
const day = new Date().toISOString().slice(0, 10);
let added = 0, rated = 0;

for (const [id, meta] of found) {
  if (!existing.has(id)) {
    await db`insert into apps (id, name, genre, source) values (${id}, ${meta.name}, ${meta.genre}, 'chart')
             on conflict (id) do nothing`;
    added++;
  }
  for (const store of STORES) {
    const l = await lookup(id, store);
    if (!l) continue;
    if (l.artwork) await db`update apps set artwork = ${l.artwork} where id = ${id} and artwork is null`;
    await db`
      insert into ratings (app_id, store, day, average, count, version, released_at)
      values (${id}, ${store}, ${day}, ${l.average}, ${l.count}, ${l.version},
              ${l.released_at ? new Date(l.released_at).toISOString() : null})
      on conflict (app_id, store, day) do update set
        average = excluded.average, count = excluded.count,
        version = excluded.version, released_at = excluded.released_at, at = now()`;
    rated++;
  }
  if (added % 25 === 0) process.stdout.write(`  ${added} added, ${rated} ratings\r`);
}
console.log(`\n${added} apps added, ${rated} ratings stored`);
