"use client";

import { useState } from "react";

export type QuoteData = {
  title: string;
  body: string;
  rating: number;
  lang: string | null;
  title_en: string | null;
  body_en: string | null;
  written_at?: string | null;
};

const LANGS: Record<string, string> = {
  de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch",
  pt: "Portuguese", tr: "Turkish", pl: "Polish", ru: "Russian", ar: "Arabic",
  ja: "Japanese", zh: "Chinese", ko: "Korean", sv: "Swedish", da: "Danish",
};

/**
 * One review, in English, with the original a click away.
 *
 * A German complaint printed in German tells an English reader nothing, and
 * the whole point of the page is that they can check the count against the
 * words. So the translation leads and the original is always reachable —
 * never replaced, because the original is the evidence and the translation is
 * a convenience.
 */
export function Quote({ q, clip = 240 }: { q: QuoteData; clip?: number }) {
  const [original, setOriginal] = useState(false);
  const translated = Boolean(q.title_en && q.lang && q.lang !== "en");
  const show = translated && !original ? { title: q.title_en!, body: q.body_en! } : { title: q.title, body: q.body };
  const text = (show.title ? `${show.title} — ` : "") + show.body.replace(/\s+/g, " ").trim().slice(0, clip);

  return (
    <span className="block">
      <span className="text-[14px] leading-relaxed">
        &ldquo;{text}&rdquo;
        <span className="font-mono text-[11px] text-faint">
          {" "}
          — {"★".repeat(q.rating)}
          {"☆".repeat(5 - q.rating)}
        </span>
      </span>
      {translated && (
        <button
          type="button"
          onClick={() => setOriginal((o) => !o)}
          className="mt-0.5 block font-mono text-[11px] text-faint underline underline-offset-2 hover:text-link"
        >
          {original
            ? "showing the original — read it in English"
            : `translated from ${LANGS[q.lang!] ?? q.lang} — see the original`}
        </button>
      )}
    </span>
  );
}
