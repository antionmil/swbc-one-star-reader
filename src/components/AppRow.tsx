import Link from "next/link";
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
export function AppRow({ view, quotes }: { view: AppView; quotes: Map<string, Quote> }) {
  const store = view.stores[0];
  if (!store) return null;
  const read = Math.min(store.read, 120);
  const negShare = store.total ? Math.round((store.read / store.total) * 100) : 0;

  return (
    <details className="group border-b border-rule-soft">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 hover:bg-surface [&::-webkit-details-marker]:hidden">
        {view.app.artwork ? (
          /* Apple's own icon, straight from their CDN. Not run through the
             image optimiser: it is already the size it is drawn at, and
             optimising twenty icons is a bill for no benefit. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.app.artwork}
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
            <span className="tnum font-mono text-[11px] text-faint">
              {negShare}% of reviews are 1&ndash;2 stars
            </span>
          </span>
          <span className="mt-1.5 flex items-center gap-3">
            <Severity clusters={store.clusters} read={read} />
            <span className="tnum shrink-0 font-mono text-[11px] text-faint">
              {store.clusters.length || "no"} complaint{store.clusters.length === 1 ? "" : "s"}
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
        <p className="font-mono text-[11px] text-faint">
          {storeName(store.store)} · {store.read} of {store.total} reviews are 1&ndash;2 stars
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
