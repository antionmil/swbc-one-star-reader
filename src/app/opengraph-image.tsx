import { ImageResponse } from "next/og";
import { SAMPLE } from "@/lib/cluster";
import { snapshot } from "@/lib/read";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "One-star reader — what people actually hate about the apps they use";

/**
 * The share card leads with the loudest complaint in the whole watchlist,
 * because that is the sentence that makes somebody click.
 */
export default async function OG() {
  const s = await snapshot();
  /* Biggest COUNT, not biggest share. Sorting by share put "Netflix Game
     Controller — QR code scanning redirects to the App Store, 11 of 300" on
     the card: a real complaint, and the weakest possible first impression.
     The count favours the apps a reader recognises, which is what the card is
     for. */
  const top = s.apps
    .flatMap((a) =>
      a.stores.flatMap((st) =>
        st.clusters.map((c) => ({ app: a.app.name, store: st.store, c, rated: st.rating?.count ?? 0 })),
      ),
    )
    .sort((x, y) => y.c.n - x.c.n || y.rated - x.rated)[0];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", background: "#ffffff", color: "#16171a", padding: 68,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#6f7075", borderBottom: "3px solid #16171a", paddingBottom: 14 }}>
          <span>ONE-STAR READER</span>
          <span>{s.totals.negative.toLocaleString("en-GB")} bad reviews, read</span>
        </div>

        {top ? (
          <div style={{ display: "flex", flexDirection: "column", borderLeft: "8px solid #b3312a", paddingLeft: 28 }}>
            <span style={{ fontSize: 26, color: "#6f7075" }}>
              {top.app} · {top.store.toUpperCase()}
            </span>
            <span style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1, marginTop: 10 }}>
              {top.c.label}
            </span>
            <span style={{ fontSize: 30, color: "#b3312a", marginTop: 14 }}>
              {top.c.n} of the {SAMPLE} most recent one- and two-star reviews
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 54, fontWeight: 700 }}>What people actually hate about the apps they use.</span>
        )}

        <div style={{ display: "flex", fontSize: 26, color: "#55565a" }}>
          {s.totals.apps} apps · every count is real · every quote is a real review
        </div>
      </div>
    ),
    size,
  );
}
