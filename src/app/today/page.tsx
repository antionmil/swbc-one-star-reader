import type { Metadata } from "next";
import Link from "next/link";
import { appSlug, snapshot } from "@/lib/read";
import { ago, numericDate, storeName } from "@/lib/when";
import { sql } from "@/lib/db";
import { Sheet } from "@/components/Sheet";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "What moved — One-star reader",
  description:
    "Ratings that fell, complaints that appeared, and reviews collected since yesterday.",
};

export default async function Today() {
  const s = await snapshot();

  /* Movement needs two readings. On the first morning there is one, and the
     page says that instead of drawing a flat line and calling it calm. */
  const moves = s.apps
    .flatMap((a) =>
      a.stores
        .filter((st) => st.rating?.average != null && st.prev?.average != null)
        .map((st) => ({
          app: a.app,
          store: st.store,
          from: st.prev!.average!,
          to: st.rating!.average!,
          delta: st.rating!.average! - st.prev!.average!,
          version: st.rating!.version,
          changedVersion: st.rating!.version !== st.prev!.version,
        })),
    )
    .filter((m) => Math.abs(m.delta) >= 0.005)
    .sort((a, b) => a.delta - b.delta);

  /* A complaint is new when the run that first produced its key is the newest
     run. Keys are stable on purpose, so a reworded label is not "new". */
  const newestRun = Math.max(0, ...s.apps.flatMap((a) => a.stores.flatMap((st) => st.clusters.map((c) => c.run_id))));
  const fresh = s.apps.flatMap((a) =>
    a.stores.flatMap((st) =>
      st.clusters.filter((c) => c.first_run === newestRun && newestRun > 0).map((c) => ({ app: a.app, store: st.store, c })),
    ),
  );

  const collected = (await sql()`
    select count(*) filter (where got > 0)::int as answered,
           count(*)::int as tried,
           coalesce(sum(fresh), 0)::int as fresh,
           max(at)::text as last
    from fetches where at > now() - interval '24 hours'`) as unknown as
    { answered: number; tried: number; fresh: number; last: string | null }[];
  const c = collected[0];

  return (
    <Sheet right={s.days[0] ? `ratings read ${numericDate(s.days[0])}` : undefined}>
      <h1 className="mt-8 max-w-[16ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[38px]">
        What moved.
      </h1>
      <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted">
        Every morning the score, the number of ratings and the shipped version are read
        again for all twenty apps. A rating that slides after a release is the thing this
        page exists to catch.
      </p>

      <section className="mt-9">
        <h2 className="border-b border-rule pb-2 text-[15px] font-bold">Ratings</h2>
        {moves.length === 0 ? (
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">
            {s.days.length < 2
              ? `Nothing yet — there is one morning of readings, taken ${
                  s.days[0] ? numericDate(s.days[0]) : "today"
                }. A change needs two, so the first comparison lands tomorrow at 06:00 UTC.`
              : "Not one rating moved by a hundredth of a star since yesterday. On twenty apps with millions of ratings each, that is the normal result."}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-rule-soft">
            {moves.map((m) => (
              <div key={`${m.app.id}-${m.store}`} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                <Link href={`/a/${appSlug(m.app.name)}`} className="text-[16px] font-semibold hover:text-loud">
                  {m.app.name}
                </Link>
                <span className="font-mono text-[11px] text-faint">{storeName(m.store)}</span>
                <span className={`tnum font-mono text-[13px] font-semibold ${m.delta < 0 ? "text-loud" : "text-ink"}`}>
                  {m.from.toFixed(2)} &rarr; {m.to.toFixed(2)}
                </span>
                {m.changedVersion && m.version && (
                  <span className="font-mono text-[11px] text-warn">new version {m.version}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-9">
        <h2 className="border-b border-rule pb-2 text-[15px] font-bold">Complaints that appeared</h2>
        {fresh.length === 0 ? (
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">
            None. A complaint appears here the first time it is large enough to be
            grouped, and that needs new reviews — see below for how few of those Apple is
            letting through.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-rule-soft">
            {fresh.map(({ app, store, c: cl }) => (
              <div key={`${app.id}-${store}-${cl.key}`} className="py-2.5">
                <p className="text-[16px] font-semibold">{cl.label}</p>
                <p className="mt-0.5 font-mono text-[11px] text-faint">
                  <Link href={`/a/${appSlug(app.name)}`} className="text-link hover:underline">
                    {app.name}
                  </Link>{" "}
                  · {storeName(store)} · {cl.n} reviews
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-9">
        <h2 className="border-b border-rule pb-2 text-[15px] font-bold">Reviews collected</h2>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">
          {c.tried === 0
            ? "No collection has been attempted in the last day."
            : `Apple answered ${c.answered} of ${c.tried} requests in the last day and gave us ${c.fresh} review${
                c.fresh === 1 ? "" : "s"
              } we did not already have.`}{" "}
          The feed is throttled to roughly one page per address per ten minutes and returns
          an empty page rather than an error when it refuses, so a low number here is
          Apple, not silence from users. The last attempt was {ago(c.last)}.
        </p>
      </section>

      <p className="mt-10 text-[14px] leading-relaxed text-muted">
        <Link href="/" className="text-link underline underline-offset-2">Back to the wire</Link>
        {" · "}
        <Link href="/method" className="text-link underline underline-offset-2">how this is measured</Link>
      </p>
    </Sheet>
  );
}
