import Link from "next/link";
import { SAMPLE } from "@/lib/cluster";
import { artwork } from "@/lib/artwork";
import type { AppView, Quote } from "@/lib/read";
import { appSlug } from "@/lib/read";
import { storeName } from "@/lib/when";
import { Complaint } from "@/components/Complaint";
import { Severity } from "@/components/Severity";

/**
 * One app, collapsed to a row until somebody wants it.
 *
 * A plain <details>. No JavaScript, no hydration, and it works on the static
 * page the moment it paints — which matters on a list of twenty where a
 * reader opens one or two.
 */
/** 18,534,843 -> "18.5M". Ratings counts are the one place on this site where
 *  the exact figure helps nobody. */
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1000)}k` : String(n);

export function AppRow({ view, quotes }: { view: AppView; quotes: Map<string, Quote> }) {
  const store = view.stores[0];
  if (!store) return null;
  const read = Math.min(store.read, SAMPLE);
  /* What the complaints add up to. "10 complaints" says nothing about size —
     you open the row and the first one alone is 40 of 284. This is the number
     the bar already draws, written down. */
  const filed = store.clusters.reduce((a, c) => a + c.n, 0);

  return (
    <details
      className="group border-b border-rule-soft"
      /* The shelf reorders these by setting `order` on the flex children, so
         the numbers it sorts by ride along on the element itself. */
      data-rated={store.rating?.count ?? 0}
      data-score={Math.round((store.rating?.average ?? 5) * 100)}
      data-complaints={store.clusters.length}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 hover:bg-surface [&::-webkit-details-marker]:hidden">
        {view.app.artwork ? (
          /* Apple's own icon, straight from their CDN. Not run through the
             image optimiser: it is already the size it is drawn at, and
             optimising twenty icons is a bill for no benefit. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artwork(view.app.artwork, 128)!}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-[9px] border border-rule"
          />
        ) : (
          <span aria-hidden className="h-10 w-10 shrink-0 rounded-[9px] border border-rule bg-surface" />
        )}

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[16px] font-bold">{view.app.name}</span>
            {/* Apple's own score, not our share of bad reviews. The row used to
                say "57% of reviews are 1–2 stars", which is true of the few
                hundred WRITTEN reviews Apple hands out and reads as if 57% of
                eighteen million ratings were bad. The honest headline number
                for an app is the one the App Store shows. */}
            <span className="tnum font-mono text-[11px] text-faint">
              {store.rating?.average != null
                ? `${store.rating.average.toFixed(2)}★${
                    store.rating.count != null ? ` from ${compact(store.rating.count)}` : ""
                  }`
                : "no rating"}
            </span>
          </span>
          <span className="mt-1.5 flex items-center gap-3">
            <Severity clusters={store.clusters} read={read} />
            <span className="tnum shrink-0 font-mono text-[11px] text-faint">
              {store.clusters.length
                ? `${store.clusters.length} complaints · ${filed} of ${read}`
                : "not read yet"}
            </span>
          </span>
        </span>

        <span
          aria-hidden
          className="shrink-0 text-faint transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>

      <div className="pb-5 pl-[52px]">
        <p className="font-mono text-[11px] leading-relaxed text-faint">
          {storeName(store.store)} · {store.read} of the last {store.total} written
          reviews are one or two stars — Apple publishes the most recent ones, not a
          selection
          {view.stores.length > 1 &&
            ` · also ${view.stores.slice(1).map((o) => storeName(o.store)).join(", ")}`}
        </p>

        <div className="mt-3 space-y-3.5">
          {store.clusters.slice(0, 3).map((c, i) => (
            <Complaint
              key={c.key}
              c={c}
              rank={i}
              read={read}
              big={i === 0}
              quote={i === 0 ? quotes.get(c.quotes[0]) : undefined}
            />
          ))}
        </div>

        <p className="mt-3 font-mono text-[11px]">
          <Link href={`/a/${appSlug(view.app.name)}`} className="text-link hover:underline">
            {store.clusters.length > 3
              ? `${store.clusters.length - 3} more complaint${store.clusters.length - 3 === 1 ? "" : "s"}, every quote and every storefront →`
              : "Every quote and every storefront →"}
          </Link>
        </p>
      </div>
    </details>
  );
}
