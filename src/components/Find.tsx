"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = {
  id: string;
  name: string;
  artwork: string | null;
  average: number | null;
  count: number | null;
  state: "read" | "watched" | "new";
};

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * Find your app.
 *
 * The watchlist first, then Apple's own search, so a developer can find their
 * own app whether or not this site has heard of it. Asking for one adds it to
 * the queue and says plainly that the reading happens later — Apple throttles
 * the review feed to about one page per address per ten minutes and refuses
 * datacentre addresses, so a promise of "in a moment" would be a lie.
 */
export function Find() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const d = (await r.json()) as { hits: Hit[] };
        /* Only the newest query may write. Without this a slow early request
           lands after a fast later one and the list contradicts the box. */
        if (mine === seq.current) setHits(d.hits ?? []);
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function ask(h: Hit) {
    setSaid((s) => ({ ...s, [h.id]: "asking" }));
    try {
      const r = await fetch("/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: h.id }),
      });
      const d = (await r.json()) as { ok?: boolean; asked?: number; error?: string };
      setSaid((s) => ({
        ...s,
        [h.id]: d.ok ? `in the queue${d.asked && d.asked > 1 ? ` · asked ${d.asked} times` : ""}` : d.error ?? "that did not save",
      }));
    } catch {
      setSaid((s) => ({ ...s, [h.id]: "that did not save" }));
    }
  }

  return (
    <div>
      <label htmlFor="find" className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
        find an app
      </label>
      <input
        id="find"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="your app, or your competitor's…"
        autoComplete="off"
        className="mt-1.5 w-full rounded-md border border-rule bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint hover:border-muted focus:border-link focus:outline-none"
      />

      {hits && (
        <div className="mt-2 divide-y divide-rule-soft border-t border-rule">
          {hits.length === 0 && !busy && (
            <p className="py-3 font-mono text-[12px] text-faint">
              Nothing by that name in the App Store.
            </p>
          )}
          {hits.map((h) => (
            <div key={h.id} className="flex items-center gap-3 py-2.5">
              {h.artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.artwork} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-[7px] border border-rule" />
              ) : (
                <span aria-hidden className="h-8 w-8 shrink-0 rounded-[7px] border border-rule bg-surface" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{h.name}</span>
                <span className="tnum block font-mono text-[11px] text-faint">
                  {h.average != null ? `${h.average.toFixed(2)}★` : "no rating"}
                  {h.count != null && ` from ${h.count.toLocaleString("en-GB")}`}
                </span>
              </span>

              {h.state === "read" ? (
                <Link href={`/a/${slug(h.name)}`} className="shrink-0 font-mono text-[11px] text-link hover:underline">
                  read →
                </Link>
              ) : said[h.id] ? (
                <span className="max-w-[46%] shrink-0 text-right font-mono text-[11px] text-faint">{said[h.id]}</span>
              ) : (
                <button
                  onClick={() => ask(h)}
                  className="shrink-0 rounded-full border border-rule px-3 py-1.5 font-mono text-[11px] hover:border-link hover:text-link"
                >
                  ask us to read it
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
        {hits === null
          ? "Any app in the App Store. The ones we have read open straight away."
          : "Asking adds an app to a queue that is worked through by hand — Apple rations its review feed, so it is not instant."}
      </p>
    </div>
  );
}
