import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Find an app, whether or not this site has ever heard of it.
 *
 * Our own watchlist first, because those rows can say what we actually know
 * about the app. Then Apple's search, so a developer can find their own app —
 * which is the entire point, and which no chart will ever contain.
 *
 * No model is called here. The brief for this build forbids an LLM in the
 * request path and it is right to: this has to answer while somebody types.
 */
export type Hit = {
  id: string;
  name: string;
  artwork: string | null;
  average: number | null;
  count: number | null;
  /** "read" = complaints are published. "watched" = we have it, no reviews
   *  read yet. "new" = not in the census at all. */
  state: "read" | "watched" | "new";
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ hits: [] }, { headers: { "cache-control": "no-store" } });

  const db = sql();
  const mine = (await db`
    select a.id, a.name, a.artwork,
           (select r.average from ratings r where r.app_id = a.id order by r.day desc limit 1) as average,
           (select r.count   from ratings r where r.app_id = a.id order by r.day desc limit 1) as count,
           exists (select 1 from clusters c where c.app_id = a.id) as read
    from apps a
    where a.name ilike ${"%" + q + "%"}
    /* A plain popularity sort put "FaceApp: Gesichtsbearbeitung" above "Bear"
       for the query "bear", because ILIKE happily matches inside a German
       compound. Name-starts-with first, then word-starts-with, then size. */
    order by (a.name ilike ${q + "%"}) desc,
             (a.name ilike ${"% " + q + "%"}) desc,
             (select max(r.count) from ratings r where r.app_id = a.id) desc nulls last
    limit 8`) as unknown as (Omit<Hit, "state"> & { read: boolean })[];

  const hits: Hit[] = mine.map((m) => ({
    id: m.id, name: m.name, artwork: m.artwork, average: m.average, count: m.count,
    state: m.read ? "read" : "watched",
  }));

  if (hits.length < 6) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=software&country=us&limit=10`,
        { headers: { "user-agent": "onestarreader.onedaybuilt.com" }, cache: "no-store" },
      );
      if (res.ok) {
        const d = (await res.json()) as { results?: Record<string, unknown>[] };
        const have = new Set(hits.map((h) => h.id));
        for (const r of d.results ?? []) {
          const id = String(r.trackId ?? "");
          if (!id || have.has(id)) continue;
          hits.push({
            id,
            name: String(r.trackName ?? ""),
            artwork: r.artworkUrl100 ? String(r.artworkUrl100) : null,
            average: typeof r.averageUserRating === "number" ? r.averageUserRating : null,
            count: typeof r.userRatingCount === "number" ? r.userRatingCount : null,
            state: "new",
          });
          if (hits.length >= 10) break;
        }
      }
    } catch {
      /* Apple being unreachable is not a reason to fail the whole search —
         whatever we already know is still worth showing. */
    }
  }

  return NextResponse.json({ hits }, { headers: { "cache-control": "no-store" } });
}
