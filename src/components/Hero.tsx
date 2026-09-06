"use client";

import { useState } from "react";
import Link from "next/link";
import { Coverflow, type Cover } from "@/components/Coverflow";
import { artwork } from "@/lib/artwork";

export type HeroApp = {
  id: string;
  name: string;
  slug: string;
  artwork: string | null;
  score: number | null;
  ratings: number | null;
  complaints: number;
  filed: number;
  read: number;
  topLabel: string | null;
  topN: number;
  store: string;
};

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1000)}k` : String(n);

/**
 * The shelf, and the caption for whichever app is facing you.
 *
 * The caption is the point of the carousel. A wall of icons is decoration; an
 * icon with the loudest complaint under it is the site in one glance.
 */
export function Hero({ apps }: { apps: HeroApp[] }) {
  const [i, setI] = useState(0);
  const app = apps[Math.min(i, apps.length - 1)];
  const covers: Cover[] = apps.map((a) => ({ id: a.id, src: artwork(a.artwork, 384), alt: a.name }));

  return (
    <div className="mt-4" style={{ ["--cover" as string]: "clamp(96px, 26vw, 150px)" }}>
      <Coverflow covers={covers} onSelect={setI} label="Apps whose reviews have been read" />

      {app && (
        <div className="mt-1 text-center">
          <Link href={`/a/${app.slug}`} className="text-[19px] font-bold hover:text-loud">
            {app.name}
          </Link>
          <p className="tnum mt-1 font-mono text-[11px] text-faint">
            {app.score != null ? `${app.score.toFixed(2)}★` : "no rating"}
            {app.ratings != null && ` from ${compact(app.ratings)}`}
            {" · "}
            {app.complaints} complaints · {app.filed} of {app.read}
          </p>
          {app.topLabel && (
            <>
              <p className="mx-auto mt-3 max-w-[34ch] text-[17px] leading-[1.3] font-semibold">
                {app.topLabel}
              </p>
              <p className="tnum mt-1 font-mono text-[11px] text-loud">
                {app.topN} of the {app.read} read
              </p>
            </>
          )}
          <p className="mt-2.5 font-mono text-[11px] text-faint">
            <Link href={`/a/${app.slug}`} className="text-link hover:underline">
              read all {app.complaints} &rarr;
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
