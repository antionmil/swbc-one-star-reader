import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hasDb, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * How many people are reading this right now.
 *
 * One heartbeat in, one honest count out. The visitor is a salted one-way hash
 * of their IP address: no cookie, nothing written to their browser, and no way
 * back from the hash to the address. The live row is deleted after five
 * minutes, so the table can say how many people are here and can never say who.
 *
 * Keyed on the address rather than on a number the browser invents, because a
 * number the browser invents can be invented a thousand times — and this figure
 * is shown to every visitor. A fabricated metric is fabricated whether the site
 * made it up or a stranger did.
 */
export async function POST(req: NextRequest) {
  const zero = { here: 0, week: 0, ever: 0 };
  const headers = { "cache-control": "no-store" };
  if (!hasDb()) return NextResponse.json(zero, { headers });

  /* Order matters. All three carry the client address on Vercel, but
     x-forwarded-for is the one a proxy in front could rewrite, and
     x-vercel-forwarded-for is documented as the one that survives that. This
     number is displayed to every visitor, so it must not be forgeable. */
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  /* Salted with the deploy's own secret, so the hashes cannot be compared with
     anybody else's and a table of the whole IPv4 space is useless. */
  const salt = process.env.CRON_SECRET ?? "one-star-reader";
  const id = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);

  try {
    const db = sql();
    await db`insert into presence (id, seen_at) values (${id}, now())
             on conflict (id) do update set seen_at = now()`;
    /* Swept on write rather than by a cron: one cheap delete on an indexed
       column, and the table cannot grow if the cron is ever disabled. */
    await db`delete from presence where seen_at < now() - interval '5 minutes'`;

    /* If this insert produced a row, the visitor had not been counted today. */
    const fresh = (await db`
      insert into visit_days (day, id) values (to_char(now(), 'YYYY-MM-DD'), ${id})
      on conflict do nothing returning id`) as unknown as { id: string }[];
    if (fresh.length) {
      await db`
        insert into visit_totals (day, n) values (to_char(now(), 'YYYY-MM-DD'), 1)
        on conflict (day) do update set n = visit_totals.n + 1`;
      await db`delete from visit_days where day < to_char(now() - interval '8 days', 'YYYY-MM-DD')`;
    }

    const [row] = (await db`
      select
        (select count(*)::int from presence where seen_at > now() - interval '45 seconds') as here,
        (select coalesce(sum(n), 0)::int from visit_totals
           where day > to_char(now() - interval '7 days', 'YYYY-MM-DD')) as week,
        (select coalesce(sum(n), 0)::int from visit_totals) as ever`) as unknown as
      { here: number; week: number; ever: number }[];

    return NextResponse.json(
      { here: row?.here ?? 1, week: row?.week ?? 0, ever: row?.ever ?? 0 },
      { headers },
    );
  } catch (e) {
    console.error("[here]", e);
    /* Never guess. A count we could not read is not a count we may invent. */
    return NextResponse.json(zero, { headers });
  }
}
