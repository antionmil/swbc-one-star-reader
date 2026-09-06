/**
 * Fills the watchlist from Apple's charts — every genre, every chart type,
 * every storefront we track.
 *
 * These apps are WATCHED, not read. A watched app has a name, a genre and a
 * storefront; a score arrives when the ratings rotation reaches it, and its
 * complaints arrive only if a collector gets the review feed to answer.
 *
 * Two things this script deliberately does NOT do:
 *
 *   It does not ask for a longer chart. A genre chart returns 100 entries
 *   whatever limit you put in the URL, so breadth comes from walking the 28
 *   genres, not from a bigger number.
 *
 *   It does not read ratings. It used to, and that is how the lookup throttle
 *   was found: 45,000 lookups from one address made Apple refuse about three
 *   in four requests, at every rate from five a second to forty. Scores are
 *   the ratings rotation's job, spread over hours and over runners.
 */
import { sql } from "../src/lib/db";
import { fillSlugs } from "../src/lib/jobs";

process.loadEnvFile(".env.local");
const db = sql();
const STORES = ["us", "de", "gb", "fr"] as const;
const CHARTS = ["topfreeapplications", "toppaidapplications"] as const;
/** Apple's iOS app genres. 0 is the all-genres chart; 6019 does not exist. */
const GENRES = [
  0, 6000, 6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010, 6011,
  6012, 6013, 6014, 6015, 6016, 6017, 6018, 6020, 6021, 6022, 6023, 6024,
  6025, 6026, 6027,
];
const UA = { "user-agent": "onestarreader.onedaybuilt.com (+one website a day)" };

type Meta = { name: string; genre: string | null };
const meta = new Map<string, Meta>();
/** app id -> the storefronts we actually saw it charting in. */
const seenIn = new Map<string, Set<string>>();
let charts = 0;

for (const store of STORES) {
  for (const chart of CHARTS) {
    for (const genre of GENRES) {
      const url =
        `https://itunes.apple.com/${store}/rss/${chart}/limit=100` +
        (genre ? `/genre=${genre}` : "") + "/json";
      try {
        const res = await fetch(url, { headers: UA });
        if (!res.ok) continue;
        const d = (await res.json()) as {
          feed?: { entry?: Record<string, { attributes?: Record<string, string>; label?: string }>[] };
        };
        for (const e of d.feed?.entry ?? []) {
          const id = e.id?.attributes?.["im:id"];
          if (!id) continue;
          if (!meta.has(id))
            meta.set(id, { name: e["im:name"]?.label ?? id, genre: e.category?.attributes?.label ?? null });
          seenIn.set(id, (seenIn.get(id) ?? new Set()).add(store));
        }
        charts++;
      } catch {
        /* one missing chart is not worth stopping the walk for */
      }
      process.stdout.write(`  ${charts} charts · ${meta.size} apps\r`);
    }
  }
}
console.log(`\n${charts} charts read · ${meta.size} distinct apps`);

const rows = [...meta.entries()];
for (let i = 0; i < rows.length; i += 400) {
  const c = rows.slice(i, i + 400);
  await db`
    insert into apps (id, name, genre, source) select *, 'chart' from unnest(
      ${c.map(([id]) => id)}::text[],
      ${c.map(([, m]) => m.name)}::text[],
      ${c.map(([, m]) => m.genre)}::text[])
    on conflict (id) do nothing`;
}

/* One watch row per storefront the app actually charted in — not four per app.
   That is what keeps the daily question count near 15,000 instead of 47,000,
   and it is why the site never asks Apple about an app in a country where it
   is not sold. */
const pairs: [string, string][] = [];
for (const [id, stores] of seenIn) for (const store of stores) pairs.push([id, store]);
for (let i = 0; i < pairs.length; i += 500) {
  const c = pairs.slice(i, i + 500);
  await db`
    insert into watch (app_id, store, source) select *, 'chart' from unnest(
      ${c.map(([id]) => id)}::text[],
      ${c.map(([, store]) => store)}::text[])
    on conflict (app_id, store) do nothing`;
}

console.log(await fillSlugs(), "named");

const [{ apps }] = (await db`select count(*)::int as apps from apps`) as unknown as { apps: number }[];
const [{ w }] = (await db`select count(*)::int as w from watch`) as unknown as { w: number }[];
console.log(`${apps} apps on the watchlist · ${w} app/storefront pairs watched`);
console.log(`scores arrive from the ratings rotation, not from here`);
