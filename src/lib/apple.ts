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
