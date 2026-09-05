import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SAMPLE } from "@/lib/cluster";
import { appSlug, snapshot } from "@/lib/read";
import { ago, numericDate, storeName } from "@/lib/when";
import { Complaint } from "@/components/Complaint";
import { Sheet } from "@/components/Sheet";

export const revalidate = 3600;

/** Without this the segment is `ƒ` in the build table and `no-store` in
 *  production. Day 2 of this run shipped exactly that on the pages every
 *  shared link pointed at. */
export async function generateStaticParams() {
  const s = await snapshot();
  return s.apps.map((a) => ({ slug: appSlug(a.app.name) }));
}

async function find(slug: string) {
  const s = await snapshot();
  const view = s.apps.find((a) => appSlug(a.app.name) === slug);
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
                      {delta !== null && delta !== 0 && (
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
                      {st.read} of {st.total} reviews are 1&ndash;2 stars
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
                          if (!quote) return null;
                          return (
                            <p key={q} className="text-[14px] leading-relaxed">
                              &ldquo;
                              {(quote.title ? `${quote.title} — ` : "") +
                                quote.body.replace(/\s+/g, " ").trim().slice(0, 240)}
                              &rdquo;
                              <span className="font-mono text-[11px] text-faint">
                                {" "}
                                — {"★".repeat(quote.rating)}
                                {"☆".repeat(5 - quote.rating)}
                                {quote.written_at ? ` · ${numericDate(quote.written_at)}` : ""}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
                Read from the {read} most recent negative reviews Apple gave us. Newest
                review {ago(st.newest)}
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
