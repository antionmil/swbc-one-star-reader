/* One date format on the whole site: 05.09.2026. Day 4 shipped "4 September
   2026" beside "05.09.2026" and a reader has to stop and check they are the
   same day. */
export function numericDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getUTCDate())}.${p(x.getUTCMonth() + 1)}.${x.getUTCFullYear()}`;
}

/** "today", "yesterday", "3 days ago". For freshness, where the gap matters
 *  more than the date. */
export function ago(d: Date | string | null | undefined): string {
  if (!d) return "never";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "never";
  const days = Math.floor((Date.now() - x.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export const STORE_NAMES: Record<string, string> = {
  us: "United States", de: "Germany", gb: "Britain", fr: "France",
};
export const storeName = (s: string) => STORE_NAMES[s] ?? s.toUpperCase();
