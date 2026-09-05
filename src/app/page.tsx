import Link from "next/link";
import { appSlug, snapshot } from "@/lib/read";
import { ago, numericDate, storeName } from "@/lib/when";
import { Complaint } from "@/components/Complaint";
import { Sheet } from "@/components/Sheet";

/**
 * The wire.
 *
 * Read at build time or during a revalidation, never while somebody waits.
 * Neon parks its compute after five minutes idle and the first visitor after a
 * quiet hour would pay for the cold start.
 */
export const revalidate = 3600;

/** Complaints per app on the front page. The rest are on the app's own page. */
const TOP = 3;

export default async function Wire() {
  const s = await snapshot();
  if (!s.totals.clusters) return <Empty />;

  /* One block per app, using whichever storefront has read the most reviews.
     Ordered by how many people have rated the app, biggest first — the wire
     opens with names a reader recognises, not with whichever obscure app has
     the most concentrated single complaint. It is a choice, and the page says
     so at the bottom rather than pretending the order is neutral. */
  const blocks = s.apps
    .map((a) => {
      const store = [...a.stores].sort((x, y) => y.clusters.length - x.clusters.length || y.read - x.read)[0];
      if (!store || !store.clusters.length) return null;
      const rated = Math.max(...a.stores.map((st) => st.rating?.count ?? 0));
      return { app: a.app, store, others: a.stores.filter((x) => x !== store), rated };
    })
    .filter(Boolean)
    .sort((a, b) => b!.rated - a!.rated) as {
      app: { id: string; name: string };
      store: (typeof s.apps)[number]["stores"][number];
      others: (typeof s.apps)[number]["stores"];
      rated: number;
    }[];

  return (
    <Sheet home right={`${s.totals.apps} apps · ${s.totals.negative.toLocaleString("en-GB")} bad reviews read`}>
      <h1 className="mt-8 max-w-[19ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[38px]">
        What people actually hate about the apps they use every day.
      </h1>
      <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted">
        {s.totals.negative.toLocaleString("en-GB")} one- and two-star App Store reviews,
        sorted into the complaints that keep coming back. Every count is the number of
        reviews in that group, and every quote is a real review.
      </p>

      <div className="mt-8 space-y-9">
        {blocks.map(({ app, store, others }) => (
          <article key={app.id}>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <Link href={`/a/${appSlug(app.name)}`} className="text-[17px] font-bold hover:text-loud">
                {app.name}
              </Link>
              <span className="font-mono text-[11px] text-faint">
                {storeName(store.store)} · {store.read} of {store.total} reviews are 1&ndash;2 stars
                {others.length > 0 && ` · also ${others.map((o) => storeName(o.store)).join(", ")}`}
              </span>
            </div>

            <div className="mt-3 space-y-3.5">
              {store.clusters.slice(0, TOP).map((c, i) => (
                <Complaint
                  key={c.key}
                  c={c}
                  rank={i}
                  read={Math.min(store.read, 120)}
                  big={i === 0}
                  quote={i === 0 ? s.quotes.get(c.quotes[0]) : undefined}
                />
              ))}
            </div>

            {store.clusters.length > TOP && (
              <p className="mt-2.5 font-mono text-[11px] text-faint">
                <Link href={`/a/${appSlug(app.name)}`} className="text-link hover:underline">
                  {store.clusters.length - TOP} more complaint
                  {store.clusters.length - TOP === 1 ? "" : "s"}, and every storefront &rarr;
                </Link>
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="mt-10 max-w-[58ch] text-[14px] leading-relaxed text-muted">
        Apps are ordered by how many people have rated them, which is a choice about
        what you would want to read first, not a ranking of quality. The newest review here was written{" "}
        {ago(s.lastReviewAt)}
        {s.lastReviewAt ? ` (${numericDate(s.lastReviewAt)})` : ""}. Ratings are re-read
        every morning and what moved is on{" "}
        <Link href="/today" className="text-link underline underline-offset-2">
          what moved
        </Link>
        . How this is measured, and the four things it cannot see, are on{" "}
        <Link href="/method" className="text-link underline underline-offset-2">
          the method page
        </Link>
        .
      </p>
    </Sheet>
  );
}

/** Before the first clustering run there is nothing to show, and the page says
 *  so. Rendering empty sections reads as broken rather than as young. */
function Empty() {
  return (
    <Sheet home>
      <h1 className="mt-8 max-w-[20ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[38px]">
        Nothing has been read yet.
      </h1>
      <p className="mt-3.5 max-w-[56ch] text-[16px] leading-relaxed text-muted">
        Twenty apps, their one- and two-star reviews, and the complaints that keep coming
        back. Nothing is published until a full pass has finished.
      </p>
      <p className="mt-3.5 text-[16px] text-muted">
        <Link href="/method" className="text-link underline underline-offset-2">
          How it is measured
        </Link>
        , in the meantime.
      </p>
    </Sheet>
  );
}
