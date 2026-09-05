import type { Metadata } from "next";
import Link from "next/link";
import { SAMPLE } from "@/lib/cluster";
import { snapshot } from "@/lib/read";
import { numericDate } from "@/lib/when";
import { Sheet } from "@/components/Sheet";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Method and limits — One-star reader",
  description:
    "Where the reviews come from, how the complaints are grouped, and the four things this cannot see.",
};

export default async function Method() {
  const s = await snapshot();
  return (
    <Sheet>
      <h1 className="mt-8 max-w-[20ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[36px]">
        How it is measured, and what it misses.
      </h1>
      <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted">
        This site prints counts next to quotes, so it owes you the method. It is small
        enough to describe in full.
      </p>

      <Block title="Where the reviews come from">
        <p>
          Apple publishes a public feed of customer reviews, fifty to a page, ten pages
          deep. That is a hard ceiling of five hundred reviews per app per storefront, and
          there is no public star histogram — the lookup endpoint gives an average and a
          count, nothing more.
        </p>
        <p>
          The corpus here is {s.totals.reviews.toLocaleString("en-GB")} reviews across{" "}
          {s.totals.apps} apps and two storefronts,{" "}
          {s.totals.negative.toLocaleString("en-GB")} of them one or two stars. The
          watchlist is the top free apps of the American chart, fixed on 31 August so that
          &ldquo;what moved&rdquo; compares like with like.
        </p>
      </Block>

      <Block title="Why the score is 4.6 and the reviews look furious">
        <p>
          They count different things. Apple&rsquo;s score averages{" "}
          <strong className="font-semibold">every rating</strong> — 18.5 million of them
          for WhatsApp in the United States — and almost all of those are a silent tap on
          a star with nothing written.
        </p>
        <p>
          The public feed only hands out <strong className="font-semibold">written
          reviews</strong>, a few hundred of the most recent. People who bother to type
          are angrier than people who tap. Across everything read here the average written
          review is <strong className="font-semibold">3.42 stars</strong> while
          Apple&rsquo;s own score for the same apps averages{" "}
          <strong className="font-semibold">4.68</strong>. The written reviews are
          U-shaped: 5,256 of one star against 8,829 of five, and very little in between.
        </p>
        <p>
          So a figure here that says two thirds of the written reviews are bad is not
          saying two thirds of users are unhappy, and this site does not put it that way.
          Every row shows Apple&rsquo;s own score first, and the counts underneath always
          name what they are counted out of.
        </p>
      </Block>

      <Block title="Apple throttles the feed, and lies about it">
        <p>
          Measured on 5 September 2026: after twelve minutes of silence one page came back
          with fifty reviews. The next five requests, over eight minutes, came back empty.
          The seventh, nine minutes after the first, was full again. Roughly one page per
          address per ten minutes.
        </p>
        <p>
          <strong className="font-semibold">A throttled request returns HTTP 200 with an
          empty feed</strong>, not an error. A site that takes that at face value publishes
          &ldquo;no complaints today&rdquo; when it means &ldquo;we were blocked&rdquo;. So
          every attempt is recorded, answered or not, and{" "}
          <Link href="/today" className="text-link underline underline-offset-2">what moved</Link>{" "}
          prints how many were refused.
        </p>
        <p>
          Datacentre addresses fare worse than home ones. GitHub&rsquo;s runners got zero of
          six pages, and two other cloud networks got nothing at all, while a home
          connection is occasionally served. The ratings endpoint has no such problem,
          which is why the daily movement on this site is built on ratings and versions
          rather than on new reviews.
        </p>
      </Block>

      <Block title="How the complaints are grouped">
        <p>
          For each app and storefront, the {SAMPLE} most recent one- and two-star reviews go
          to Claude Haiku 4.5 in one request. It is asked to put each review into a group,
          not to describe the app — so the count beside a complaint is arithmetic on its
          answer, not a number it was asked to guess.
        </p>
        <p>
          Every quote on this site is a review someone wrote. The model returns the index
          of a review it read; the site looks that index up and prints the original text.
          It never writes a quote.
        </p>
        <p>
          Each group carries a stable key, and the key is what makes &ldquo;this complaint
          is new&rdquo; answerable. Comparing labels would call every reworded sentence a
          new complaint.
        </p>
      </Block>

      <Block title="The four things it cannot see">
        <p>
          <strong className="font-semibold">Anything on Google Play.</strong> There is no
          public reviews API, and scraping it breaches Google&rsquo;s terms.
        </p>
        <p>
          <strong className="font-semibold">The shape of the ratings.</strong> Apple
          publishes an average and a count. How many ones against how many fives is not
          public, so this site never claims a distribution.
        </p>
        <p>
          <strong className="font-semibold">Anything past five hundred reviews.</strong> On
          an app with millions of ratings, the corpus is a recent slice, and every figure
          says which slice it came from.
        </p>
        <p>
          <strong className="font-semibold">Whether a complaint is fair.</strong> These are
          reviews. People exaggerate, brigade, and blame the app for their phone. The site
          counts what was written; it does not endorse it.
        </p>
      </Block>

      <Block title="Corrections">
        <p>
          If a group is wrong about your app, the reviews it was built from are printed
          underneath it — so a correction is checkable rather than a matter of opinion.{" "}
          <a className="text-link underline underline-offset-2" href="https://x.com/antionmil">@antionmil</a>.
        </p>
        <p>
          <Link href="/" className="text-link underline underline-offset-2">Back to the wire</Link>.
          {s.days[0] ? ` Ratings last read ${numericDate(s.days[0])}.` : ""}
        </p>
      </Block>
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="border-b border-rule pb-2 text-[15px] font-bold">{title}</h2>
      <div className="mt-3 max-w-[60ch] space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
