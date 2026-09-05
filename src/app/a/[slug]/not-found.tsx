import Link from "next/link";
import { Sheet } from "@/components/Sheet";

export default function NotFound() {
  return (
    <Sheet>
      <h1 className="mt-8 max-w-[18ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[36px]">
        Not in this watchlist.
      </h1>
      <p className="mt-3.5 max-w-[56ch] text-[16px] leading-relaxed text-muted">
        Twenty apps are read here, and this is not one of them. The list is fixed so that
        &ldquo;what moved&rdquo; means something.
      </p>
      <p className="mt-3.5 text-[16px] text-muted">
        <Link href="/" className="text-link underline underline-offset-2">Back to the wire</Link>
      </p>
    </Sheet>
  );
}
