"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-7">
      <div className="border-b-2 border-ink pb-2 text-[13px] font-bold tracking-[0.02em]">ONE-STAR READER</div>
      <h1 className="mt-8 max-w-[18ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em]">
        This page did not render.
      </h1>
      <p className="mt-3.5 max-w-[56ch] text-[16px] leading-relaxed text-muted">
        The reviews are read once a day and served from a static page, so this is almost
        certainly temporary.
      </p>
      <p className="mt-3.5 text-[16px] text-muted">
        <button onClick={reset} className="text-link underline underline-offset-2">Try again</button>
        {" · "}
        <Link href="/" className="text-link underline underline-offset-2">the wire</Link>
      </p>
    </main>
  );
}
