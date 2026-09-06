import type { MetadataRoute } from "next";
import { snapshot } from "@/lib/read";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://onestarreader.onedaybuilt.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await snapshot();
  const at = new Date();
  return [
    { url: BASE, lastModified: at, priority: 1 },
    { url: `${BASE}/today`, lastModified: at, priority: 0.8 },
    { url: `${BASE}/method`, lastModified: at, priority: 0.5 },
    { url: `${BASE}/requested`, lastModified: at, priority: 0.5 },
    /* Only the apps this site can actually say something about. Listing all
       11,798 watched apps would submit ten thousand pages whose whole content
       is "nothing read yet" — that is a thin-content sitemap, not reach. An
       app joins the moment it has a score. */
    ...s.apps
      .filter((a) => a.stores.some((st) => st.clusters.length || st.rating))
      .map((a) => ({
        url: `${BASE}/a/${a.slug}`,
        lastModified: at,
        priority: a.stores.some((st) => st.clusters.length) ? 0.7 : 0.4,
      })),
  ];
}
