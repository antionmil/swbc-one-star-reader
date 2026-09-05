import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "@/lib/apple";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per address, per day. Enough for a person with a few apps and a competitor
 *  or two; not enough to fill the queue with a script. */
const PER_DAY = 6;

/**
 * "Read this app."
 *
 * The app is watched from the moment somebody asks: the rating, the version
 * and the icon come from Apple's lookup endpoint, which answers instantly and
 * from anywhere. Its REVIEWS are another matter — Apple throttles that feed to
 * roughly one page per address per ten minutes and refuses datacentre
 * addresses outright, so the reading happens when a collector reaches it. The
 * response says so rather than implying it is done.
 */
export async function POST(req: NextRequest) {
  const headers = { "cache-control": "no-store" };
  let id = "";
  try {
    const body = (await req.json()) as { id?: string };
    id = String(body.id ?? "").replace(/\D/g, "").slice(0, 20);
  } catch {
    return NextResponse.json({ error: "Send an app id." }, { status: 400, headers });
  }
  if (!id) return NextResponse.json({ error: "Send an app id." }, { status: 400, headers });

  /* Keyed on the address, hashed with the deploy's own secret. Same reasoning
     as every counter on these sites: a number a browser invents can be invented
     a thousand times. */
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const who = createHash("sha256").update(`${process.env.CRON_SECRET ?? "osr"}:${ip}`).digest("hex").slice(0, 32);

  const db = sql();
  try {
    const [{ n }] = (await db`
      select count(*)::int as n from requests where who = ${who} and at > now() - interval '1 day'`) as unknown as { n: number }[];
    if (n >= PER_DAY)
      return NextResponse.json(
        { error: `That is ${PER_DAY} apps today. The queue is read by hand, so it is a real limit rather than a polite one.` },
        { status: 429, headers },
      );

    const [known] = (await db`select id, name from apps where id = ${id}`) as unknown as { id: string; name: string }[];
    let name = known?.name ?? "";

    if (!known) {
      const l = await lookup(id, "us");
      if (!l?.name) return NextResponse.json({ error: "Apple does not know that app." }, { status: 404, headers });
      name = l.name;
      await db`insert into apps (id, name, artwork, source) values (${id}, ${l.name}, ${l.artwork}, 'request')
               on conflict (id) do nothing`;
      const day = new Date().toISOString().slice(0, 10);
      await db`
        insert into ratings (app_id, store, day, average, count, version, released_at)
        values (${id}, 'us', ${day}, ${l.average}, ${l.count}, ${l.version},
                ${l.released_at ? new Date(l.released_at).toISOString() : null})
        on conflict (app_id, store, day) do nothing`;
    }

    await db`insert into requests (app_id, who) values (${id}, ${who})`;
    const [{ asked }] = (await db`
      select count(*)::int as asked from requests where app_id = ${id}`) as unknown as { asked: number }[];

    return NextResponse.json({ ok: true, id, name, asked }, { headers });
  } catch (e) {
    console.error("[request]", e);
    return NextResponse.json({ error: "That did not save. Try again in a moment." }, { status: 500, headers });
  }
}
