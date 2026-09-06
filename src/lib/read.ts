import "server-only";
import { sql } from "@/lib/db";

/**
 * Everything the site reads, loaded once per process and indexed in memory.
 *
 * Day 4 of this run learned it the expensive way: three queries per page over
 * a thousand pages made Neon answer `53300: too many connections` and the
 * build died with no other symptom. One load, one index, and a short life on
 * the cache so a warm serverless instance cannot serve last week's survey.
 */
export type Cluster = {
  app_id: string; store: string; key: string; label: string; blurb: string;
  n: number; share: number; quotes: string[]; first_run: number; run_id: number;
};
export type Quote = {
  review_id: string; title: string; body: string; rating: number;
  written_at: string | null;
  /** Filled by scripts/translate.mts for the reviews the site quotes. */
  lang: string | null; title_en: string | null; body_en: string | null;
};
export type Rating = { app_id: string; store: string; day: string; average: number | null; count: number | null; version: string | null; released_at: string | null };
export type App = { id: string; name: string; genre: string | null; artwork: string | null; slug: string | null };

export type Store = {
  store: string;
  read: number;          // negative reviews in the corpus
  total: number;         // all reviews in the corpus
  clusters: Cluster[];
  rating: Rating | null;
  prev: Rating | null;
  /** The most recent review Apple has given us, and when we last got one. */
  newest: string | null;
  last_collected: string | null;
};

export type AppView = {
  app: App;
  stores: Store[];
  /** Unique across the whole watchlist. Never derive a link from the name —
   *  see the note on `appSlug`. */
  slug: string;
};

export type Snapshot = {
  apps: AppView[];
  /** Apps we have read complaints for, and apps we only watch. */
  read: number;
  watched: number;
  quotes: Map<string, Quote>;
  /** Distinct days we hold ratings for. Two is the minimum for a delta. */
  days: string[];
  totals: { apps: number; reviews: number; negative: number; clusters: number };
  /** app id to its unique slug, for the pages that hold an id and not a view. */
  slugs: Map<string, string>;
  lastReviewAt: string | null;
};

const TTL_MS = 120_000;
let cached: { at: number; value: Promise<Snapshot> } | null = null;

export function snapshot(): Promise<Snapshot> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load();
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

async function load(): Promise<Snapshot> {
  const db = sql();
  const [apps, clusters, counts, ratings, newest, quoteRows, days] = await Promise.all([
    db`select id, name, genre, artwork, slug from apps order by name, id` as unknown as Promise<App[]>,
    db`select app_id, store, key, label, blurb, n, share, quotes, first_run, run_id
       from clusters order by n desc` as unknown as Promise<Cluster[]>,
    db`select app_id, store, count(*)::int as total,
              count(*) filter (where rating <= 2)::int as read
       from reviews group by app_id, store` as unknown as Promise<{ app_id: string; store: string; total: number; read: number }[]>,
    /* Two days per app and storefront, not every day ever recorded. The page
       shows today's score and yesterday's delta and nothing else, and the
       watchlist is now thousands of apps — the unbounded version would have
       pulled the whole ratings history into memory on every cold render.

       `average is null` is a recorded miss: the job asked Apple about an app
       that is not sold in that storefront. It is kept so the rotation does not
       ask again tomorrow, and dropped here so the site never shows it. */
    db`select app_id, store, day, average, count, version, released_at from (
         select *, row_number() over (partition by app_id, store order by day desc) as rn
         from ratings where average is not null) t
       where rn <= 2 order by day desc` as unknown as Promise<Rating[]>,
    db`select app_id, store, max(written_at)::text as newest, max(first_seen)::text as collected
       from reviews group by app_id, store` as unknown as Promise<{ app_id: string; store: string; newest: string | null; collected: string | null }[]>,
    db`select review_id, title, body, rating, lang, title_en, body_en,
              written_at::text as written_at from reviews
       where review_id in (select jsonb_array_elements_text(quotes) from clusters)` as unknown as Promise<Quote[]>,
    db`select distinct day from ratings where average is not null
       order by day desc limit 30` as unknown as Promise<{ day: string }[]>,
  ]);

  const byPair = <T extends { app_id: string; store: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(`${r.app_id}|${r.store}`, [...(m.get(`${r.app_id}|${r.store}`) ?? []), r]);
    return m;
  };
  const cl = byPair(clusters), ct = byPair(counts), ra = byPair(ratings), nw = byPair(newest);

  /* Slugs are read, not computed.
     
     They used to be derived from the name at every link, which was fine while
     the watchlist was 441 apps and every name was unique. At 11,798 it is
     neither: five apps are called McDonald's and 62 are written entirely in
     Chinese, Arabic or Japanese and reduce to nothing. 169 apps had no
     reachable page, and the search box — where a reader arrives — was building
     its links in the browser from the name alone and sending people to another
     company's app.

     `fillSlugs()` decides them once, against a unique index, and they are the
     same in the browser, in the sitemap and here. The fallback below is for an
     app inserted between two runs of that job. */
  const slugs = new Map<string, string>();
  for (const app of apps)
    slugs.set(app.id, app.slug ?? (appSlug(app.name) || `app-${app.id}`));

  const views: AppView[] = apps.map((app) => {
    /* Richest storefront first. Sorting the codes alphabetically put Germany
       above the United States on every app, which buried the storefront the
       corpus actually knows most about.

       An app with no reviews at all still has a rating, and its page has to be
       able to say "watched, not read yet" instead of rendering a bare title —
       which is what 421 of the 441 apps did until this fallback existed. */
    const withReviews = counts
      .filter((c) => c.app_id === app.id)
      .sort((x, y) => y.read - x.read || x.store.localeCompare(y.store))
      .map((c) => c.store);
    const rated = [...new Set(ratings.filter((r) => r.app_id === app.id).map((r) => r.store))];
    /* Every storefront we hold a score for, with the ones we have actually read
       first. A read app now shows four scores side by side and says plainly
       which of them have complaints behind them. */
    const stores = [...withReviews, ...rated.filter((s) => !withReviews.includes(s))];
    return {
      app,
      slug: slugs.get(app.id)!,
      stores: stores.map((store) => {
        const k = `${app.id}|${store}`;
        const r = ra.get(k) ?? [];
        const n = nw.get(k)?.[0];
        return {
          store,
          read: ct.get(k)?.[0]?.read ?? 0,
          total: ct.get(k)?.[0]?.total ?? 0,
          clusters: (cl.get(k) ?? []).sort((a, b) => b.n - a.n),
          rating: r[0] ?? null,
          prev: r[1] ?? null,
          newest: n?.newest ?? null,
          last_collected: n?.collected ?? null,
        };
      }),
    };
  });

  const totals = {
    apps: apps.length,
    reviews: counts.reduce((a, c) => a + c.total, 0),
    negative: counts.reduce((a, c) => a + c.read, 0),
    clusters: clusters.length,
  };
  const lastReviewAt = newest.map((n) => n.newest).filter(Boolean).sort().at(-1) ?? null;

  const readCount = views.filter((v) => v.stores.some((st) => st.clusters.length)).length;

  return {
    apps: views,
    read: readCount,
    watched: views.length - readCount,
    quotes: new Map(quoteRows.map((q) => [q.review_id, q])),
    days: days.map((d) => d.day),
    totals,
    slugs,
    lastReviewAt,
  };
}

/**
 * The slug a name WANTS. Not necessarily the slug an app HAS.
 *
 * Two apps can want the same one and a name in a non-Latin script wants an
 * empty one, so the unique slug is decided in `load()` and carried on the view
 * as `slug`. Link from that, or from `snapshot().slugs`, never from this.
 */
export const appSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
