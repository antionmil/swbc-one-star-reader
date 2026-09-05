import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * THE FONT TRAP.
 *
 * ImageResponse needs real font bytes - it cannot use a CSS font-family, and
 * a missing font silently falls back to a default that looks nothing like the
 * site. Budget an hour for this once, here, and never again for 26 builds.
 *
 * Fetch the TTF once per lambda and memoise it. Google's CSS endpoint returns
 * a stylesheet, not a font, so we parse the src URL out of it first.
 */
let fontCache: ArrayBuffer | null = null;

async function displayFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Archivo:wght@700&display=swap",
      // A modern UA gets woff2, which ImageResponse cannot read. Pretend to be
      // old so Google serves a TTF.
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; SWBC/1.0)" } },
    );
    const css = await cssRes.text();
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    fontCache = await (await fetch(url)).arrayBuffer();
    return fontCache;
  } catch {
    return null; // never let a font failure take down the image
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? process.env.NEXT_PUBLIC_SITE_NAME ?? "SWBC").slice(0, 90);
  const stat = searchParams.get("stat")?.slice(0, 24);
  const subtitle = searchParams.get("subtitle")?.slice(0, 120);

  const font = await displayFont();

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0e1215",
          color: "#e5eaed",
          padding: "72px",
          fontFamily: font ? "Display" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: "#58beb1", letterSpacing: 2 }}>
          {(process.env.NEXT_PUBLIC_SITE_NAME ?? "SWBC").toUpperCase()}
        </div>

        {stat ? (
          <div style={{ display: "flex", fontSize: 150, lineHeight: 1, color: "#58beb1" }}>{stat}</div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: stat ? 46 : 68, lineHeight: 1.1 }}>{title}</div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 28, color: "#97a4ae" }}>{subtitle}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font ? [{ name: "Display", data: font, style: "normal", weight: 700 }] : [],
    },
  );
}
