"use client";

import { useEffect, useState } from "react";

type Counts = { here: number; week: number; ever: number };

/* 1,240 -> "1.2k". Under a thousand keeps its exact figure, because rounding a
   real small number is the first step towards inflating it. */
const short = (n: number) =>
  n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`;

/* A weekly or all-time figure only appears once it means something. Holding a
   small real number back is allowed; inflating one is not, so nothing here is
   ever rounded up to look busier. "Reading now" always shows, including when
   it is 1 — that is true, and it is useful. */
const WEEK_FLOOR = 25;
const EVER_FLOOR = 50;

/**
 * The room, under the masthead.
 *
 * Nothing is claimed until the first heartbeat returns: a bar that renders a
 * number on the server and then corrects itself is the stale flash this
 * project bans, and the honest form of "not known yet" is empty space. The
 * wrapper keeps its height either way so the headline never jumps.
 */
export function Here() {
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    let dead = false;
    const beat = async () => {
      try {
        const r = await fetch("/api/here", { method: "POST" });
        const d = (await r.json()) as Counts;
        if (!dead && typeof d.here === "number" && d.here > 0) setC(d);
      } catch {
        /* silence beats a wrong number */
      }
    };
    beat();
    const id = setInterval(beat, 20_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  if (!c) return <div className="h-[34px]" aria-hidden />;

  const stats: string[] = [];
  if (c.week >= WEEK_FLOOR) stats.push(`${short(c.week)} this week`);
  if (c.ever >= EVER_FLOOR) stats.push(`${short(c.ever)} all-time`);

  return (
    <div className="flex h-[34px] items-center">
      <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-full border border-rule bg-surface px-3.5 py-1.5 text-[12px]">
        <span className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
            <span className="pulse absolute inline-flex h-full w-full rounded-full bg-live opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
          </span>
          <span className="tnum font-mono font-semibold text-ink">{c.here}</span>
          <span className="text-muted">{c.here === 1 ? "reading now" : "online now"}</span>
        </span>
        {stats.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="tnum font-mono font-semibold text-ink">{s.split(" ")[0]}</span>
            <span className="text-muted">{s.split(" ").slice(1).join(" ")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
