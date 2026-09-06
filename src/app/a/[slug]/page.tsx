import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SAMPLE } from "@/lib/cluster";
import { appSlug, snapshot } from "@/lib/read";
import { ago, numericDate, storeName } from "@/lib/when";
import { Complaint } from "@/components/Complaint";
import { Quote } from "@/components/Quote";
import { Sheet } from "@/components/Sheet";

export const revalidate = 3600;

/** Without this the segment is `ƒ` in the build table and `no-store` in
 *  production. Day 2 of this run shipped exactly that on the pages every
 *  shared link pointed at. */
export async function generateStaticParams() {
  const s = await snapshot();
  /* Only the apps we have actually read. The watchlist is 11,798 apps and
     prerendering every one of them is a build that does not finish; the rest
     render on first request and are cached from then on, which is what
     `revalidate` above is for. */
  return s.apps.filter((a) => a.stores.some((st) => st.clusters.length)).map((a) => ({ slug: a.slug }));
}

async function find(slug: string) {
  const s = await snapshot();
  const view = s.apps.find((a) => a.slug === slug);
  return view ? { s, view } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await find((await params).slug);
  if (!found) return { title: "Not in this watchlist" };
  const { view } = found;
  const top = view.stores.flatMap((st) => st.clusters).sort((a, b) => b.n - a.n)[0];
  const title = `What people hate about ${view.app.name} — One-star reader`;
  const description = top
    ? `The complaints in ${view.app.name}'s one-star reviews, counted. Biggest: ${top.label.toLowerCase()} (${top.n} reviews).`
    : `The complaints in ${view.app.name}'s one-star reviews, counted.`;
  return { title, description, openGraph: { title, description } };
}

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await find((await params).slug);
  if (!found) notFound();
  const { s, view } = found;

  return (
    <Sheet right={view.app.genre ?? undefined}>
      <h1 className="mt-8 text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[36px]">
        {view.app.name}
      </h1>

      {/* An app with no storefront section at all: on the watchlist, but its
          score has not come round in the rotation yet. 421 of 441 apps rendered
          as a bare title once already for the same reason — a page that shows
          only a heading reads as broken, not as young. */}
      {view.stores.length === 0 && (
        <p className="mt-6 max-w-[58ch] text-[15px] leading-relaxed text-muted">
          This app is on the watchlist and nothing has been read yet. Its rating
          arrives on the next pass, usually within a day; its complaints take
          longer, because Apple rations the review feed to about one page per
          address every ten minutes.{" "}
          <Link href="/method" className="text-link underline underline-offset-2">
            How that works
          </Link>
          .
        </p>
      )}

      <div className="mt-8 space-y-10">
        {view.stores.map((st) => {
          const read = Math.min(st.read, SAMPLE);
          const delta =
            st.rating?.average != null && st.prev?.average != null
              ? st.rating.average - st.prev.average
              : null;
          return (
            <section key={st.store}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2">
                <h2 className="text-[15px] font-bold">{storeName(st.store)}</h2>
                <span className="tnum font-mono text-[11px] text-faint">
                  {st.rating?.average != null && (
                    <>
                      {st.rating.average.toFixed(2)}★
                      {st.rating.count != null && ` from ${st.rating.count.toLocaleString("en-GB")} ratings`}
                      {/* A rating that moved by a ten-thousandth is a rating that
                          did not move, and "− 0.00 since yesterday" is a
                          sentence that makes a reader doubt every other number
                          on the page. */}
                      {delta !== null && Math.abs(delta) >= 0.005 && (
                        <span className={delta < 0 ? "text-loud" : "text-ink"}>
                          {" "}
                          {delta > 0 ? "+" : "−"}
                          {Math.abs(delta).toFixed(2)} since yesterday
                        </span>
                      )}
                      {" · "}
                    </>
                  )}
                  {st.rating?.version && `version ${st.rating.version}`}
                  {/* "0 of 0 reviews are 1–2 stars" is not a fact worth
                      printing. A watched app says nothing here; the sentence
                      underneath explains why. */}
                  {st.total > 0 && (
                    <>
                      {st.rating?.version ? " · " : ""}
                      {st.read} of the last {st.total} written reviews are one or two stars
                    </>
                  )}
                </span>
              </div>

              {st.clusters.length === 0 ? (
                <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-muted">
                  {st.total === 0
                    ? "We have not read this app's reviews yet. Apple rations that feed to about one page per address every ten minutes and refuses datacentre addresses, so the reading is done by hand — the rating above is live, the complaints are not there yet."
                    : `Not enough negative reviews here to group anything honestly. There are ${st.read}, and the threshold is twelve.`}
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {st.clusters.map((c, i) => (
                    <div key={c.key}>
                      <Complaint c={c} rank={i} read={read} big={i === 0} />
                      <div className="mt-2.5 space-y-2 border-l-[3px] border-transparent pl-3.5">
                        {c.quotes.map((q) => {
                          const quote = s.quotes.get(q);
                          return quote ? <Quote key={q} q={quote} /> : null;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
                Apple publishes the most recent written reviews, up to five hundred, and
                that is what was read — not a search for bad ones.{" "}
                <Link href="/method#written" className="text-link hover:underline">
                  Why so many of them are angry
                </Link>
                . The complaints above come from the {read} most recent negative ones.
                Newest review {ago(st.newest)}
                {st.newest ? ` (${numericDate(st.newest)})` : ""}, last collected{" "}
                {ago(st.last_collected)}.
              </p>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-[14px] leading-relaxed text-muted">
        <Link href="/" className="text-link underline underline-offset-2">Back to the wire</Link>
        {" · "}
        <Link href="/method" className="text-link underline underline-offset-2">what this cannot see</Link>
      </p>
    </Sheet>
  );
}
