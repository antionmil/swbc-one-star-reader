import type { MetadataRoute } from "next";
import { appSlug, snapshot } from "@/lib/read";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://onestarreader.onedaybuilt.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await snapshot();
  const at = new Date();
  return [
    { url: BASE, lastModified: at, priority: 1 },
    { url: `${BASE}/today`, lastModified: at, priority: 0.8 },
    { url: `${BASE}/method`, lastModified: at, priority: 0.5 },
    ...s.apps.map((a) => ({ url: `${BASE}/a/${appSlug(a.app.name)}`, lastModified: at, priority: 0.7 })),
  ];
}
