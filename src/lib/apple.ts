import "server-only";
import { clean } from "@/lib/cluster";

/**
 * One page of App Store reviews.
 *
 * APPLE ANSWERS A THROTTLED REQUEST WITH HTTP 200 AND AN EMPTY FEED. Measured
 * on 5 September 2026: after twelve minutes of silence one page came back with
 * 50 reviews, the next five requests over eight minutes came back empty, and
 * the seventh — nine minutes after the first — was full again. Roughly one page
 * per address per ten minutes, and never an error code to tell you so.
 *
 * Everything downstream is built around that: an empty page is recorded as an
 * empty page, never as "this app has no complaints today".
 */
export type Review = {
  review_id: string;
  rating: number;
  title: string;
  body: string;
  version: string | null;
  written_at: string | null;
};

const UA = "onestarreader.onedaybuilt.com (+one website a day)";

export async function fetchPage(appId: string, store: string, page: number): Promise<Review[] | null> {
  const url = `https://itunes.apple.com/${store}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store" });
  } catch {
    return null; // a network failure is not an empty page
  }
  if (!res.ok) return null;

  let feed: { feed?: { entry?: unknown } };
  try {
    feed = (await res.json()) as typeof feed;
  } catch {
    return null;
  }
  const raw = feed.feed?.entry;
  if (!Array.isArray(raw)) return [];

  const out: Review[] = [];
  for (const e of raw as Record<string, { label?: string; attributes?: Record<string, string> }>[]) {
    /* On page 1 Apple puts the app itself in entry[0]. It has no rating, which
       is how it is told apart — not by its position, because on a throttled
       page there is no entry[0] to skip. */
    const rating = Number(e["im:rating"]?.label);
    const id = e.id?.label;
    if (!rating || !id) continue;
    out.push({
      review_id: id,
      rating,
      title: clean(e.title?.label ?? "").slice(0, 400),
      body: clean(e.content?.label ?? "").slice(0, 2000),
      version: e["im:version"]?.label ?? null,
      written_at: e.updated?.label ?? null,
    });
  }
  return out;
}

export type Lookup = {
  name: string;
  average: number | null;
  count: number | null;
  version: string | null;
  released_at: string | null;
};

/**
 * The rating, the number of ratings and the shipped version.
 *
 * Unlike the review feed, this endpoint answers a datacentre address without
 * complaint — verified from two separate cloud networks — which is why the
 * daily movement on this site is built on it.
 */
export async function lookup(appId: string, store: string): Promise<Lookup | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${appId}&country=${store}`, {
      headers: { "user-agent": "onestarreader.onedaybuilt.com (+one website a day)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { results?: Record<string, unknown>[] };
    const r = d.results?.[0];
    if (!r) return null;
    return {
      name: String(r.trackName ?? ""),
      average: typeof r.averageUserRating === "number" ? r.averageUserRating : null,
      count: typeof r.userRatingCount === "number" ? r.userRatingCount : null,
      version: r.version ? String(r.version) : null,
      released_at: r.currentVersionReleaseDate ? String(r.currentVersionReleaseDate) : null,
    };
  } catch {
    return null;
  }
}
