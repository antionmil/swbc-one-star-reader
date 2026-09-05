import Link from "next/link";
import { Here } from "@/components/Here";

/** The masthead and the footer, on every page. */
export function Sheet({
  right,
  home = false,
  children,
}: {
  right?: string | null;
  /** The wire itself. Every other page gets an arrow back to it. */
  home?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-9 sm:px-7 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-2">
        <Link href="/" className="group flex items-center gap-2 text-[13px] font-bold tracking-[0.02em] hover:text-loud">
          {!home && <span aria-hidden className="text-faint group-hover:text-loud">&larr;</span>}
          <span>ONE-STAR READER</span>
          {!home && <span className="sr-only">— back to the wire</span>}
        </Link>
        {right && <span className="tnum font-mono text-[11px] text-faint">{right}</span>}
      </div>

      <div className="mt-3.5">
        <Here />
      </div>

      {children}

      <footer className="mt-14 border-t border-rule pt-4 font-mono text-[11px] leading-relaxed text-faint">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/" className="hover:text-loud">the wire</Link>
          <Link href="/today" className="hover:text-loud">what moved</Link>
          <Link href="/requested" className="hover:text-loud">the queue</Link>
          <Link href="/method" className="hover:text-loud">method &amp; limits</Link>
          <a href="https://onedaybuilt.com" className="hover:text-loud">one website a day</a>
        </div>
        <p className="mt-3 max-w-prose">
          Reviews and ratings from Apple&rsquo;s public App Store feeds. Complaints are
          grouped by a language model from the reviews shown beside them, never invented.
          Nothing is stored in your browser. Day 5 of{" "}
          <a className="underline underline-offset-2 hover:text-loud" href="https://onedaybuilt.com">26</a>
          , by{" "}
          <a className="underline underline-offset-2 hover:text-loud" href="https://x.com/antionmil">@antionmil</a>.
        </p>
      </footer>
    </main>
  );
}
