import type { Cluster } from "@/lib/read";

/**
 * How bad it is, at a glance.
 *
 * The bar is the sample of negative reviews that was read. The biggest
 * complaint is red, the second is amber, everything else that was grouped is
 * grey, and what is left is the negatives that fit no group — drawn as an
 * empty track rather than a fourth colour, because "we could not file this"
 * is not a finding.
 *
 * Only the first two get a colour. A bar where every segment shouts says
 * nothing, and the point of this row is that you can compare twenty of them
 * down a page without reading a word.
 */
export function Severity({ clusters, read }: { clusters: Cluster[]; read: number }) {
  const seg = clusters.map((c) => ({ key: c.key, pct: (c.n / read) * 100 }));
  const filed = seg.reduce((a, s) => a + s.pct, 0);
  const label =
    clusters.length === 0
      ? "no grouped complaints"
      : `${Math.round(filed)}% of the negative reviews fall into ${clusters.length} recurring complaint${clusters.length === 1 ? "" : "s"}`;

  return (
    <span
      className="flex h-[6px] w-full overflow-hidden rounded-full bg-rule-soft"
      role="img"
      aria-label={label}
      title={label}
    >
      {seg.map((s, i) => (
        <span
          key={s.key}
          style={{ width: `${s.pct}%` }}
          className={i === 0 ? "bg-loud" : i === 1 ? "bg-warn" : "bg-faint"}
        />
      ))}
    </span>
  );
}
