import type { Cluster, Quote as QuoteRow } from "@/lib/read";
import { Quote } from "@/components/Quote";

/**
 * One complaint, as a headline.
 *
 * The rank decides the colour, and only the first two get one: a page where
 * every line is red says nothing. The count is real — the model was made to
 * put each review it read into a group, and this is arithmetic on that answer,
 * not a number the model was asked to guess.
 */
export function Complaint({
  c,
  rank,
  quote,
  read,
  big = false,
}: {
  c: Cluster;
  rank: number;
  quote?: QuoteRow;
  read: number;
  big?: boolean;
}) {
  const tone = rank === 0 ? "border-loud" : rank === 1 ? "border-warn" : "border-rule";
  return (
    <div className={`border-l-[3px] pl-3.5 ${tone}`}>
      <p className={big ? "text-[19px] leading-[1.3] font-semibold tracking-[-0.01em] sm:text-[21px]" : "text-[16px] leading-[1.35] font-semibold"}>
        {c.label}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-faint">
        <span className="tnum text-ink">{c.n}</span>
        <span>of the {read} read</span>
        <span aria-hidden>·</span>
        <span className="tnum">{Math.round(c.share * 100)}%</span>
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{c.blurb}</p>
      {quote && (
        <div className="mt-2">
          <Quote q={quote} clip={170} />
        </div>
      )}
    </div>
  );
}
