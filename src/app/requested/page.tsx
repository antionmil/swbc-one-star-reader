import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { appSlug } from "@/lib/read";
import { artwork } from "@/lib/artwork";
import { ago } from "@/lib/when";
import { Sheet } from "@/components/Sheet";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "The queue — One-star reader",
  description: "Apps people have asked us to read, and how far down the list they are.",
};

type Row = {
  id: string; name: string; artwork: string | null; asked: number;
  last: string; read: boolean; average: number | null; count: number | null;
};

export default async function Requested() {
  const rows = (await sql()`
    select a.id, a.name, a.artwork,
           count(r.id)::int as asked,
           max(r.at)::text as last,
           exists (select 1 from clusters c where c.app_id = a.id) as read,
           (select x.average from ratings x where x.app_id = a.id order by x.day desc limit 1) as average,
           (select x.count   from ratings x where x.app_id = a.id order by x.day desc limit 1) as count
    from requests r join apps a on a.id = r.app_id
    group by a.id, a.name, a.artwork
    order by exists (select 1 from clusters c where c.app_id = a.id) asc, count(r.id) desc, max(r.at) desc
    limit 200`) as unknown as Row[];

  const waiting = rows.filter((r) => !r.read);
  const done = rows.filter((r) => r.read);

  return (
    <Sheet right={rows.length ? `${rows.length} asked for` : undefined}>
      <h1 className="mt-8 max-w-[16ch] text-[30px] leading-[1.08] font-bold tracking-[-0.02em] sm:text-[38px]">
        The queue.
      </h1>
      <p className="mt-3.5 max-w-[58ch] text-[16px] leading-relaxed text-muted">
        Anybody can ask for an app. Its rating, version and icon appear at once, because
        Apple answers those instantly. Its reviews take longer: Apple rations that feed to
        roughly one page per address every ten minutes and refuses datacentre addresses
        outright, so the reading is done by hand from a machine it will talk to.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 border-y border-rule py-8 text-[17px] leading-snug font-semibold">
          Nobody has asked for an app yet. Yours can be the first —{" "}
          <Link href="/" className="text-link underline underline-offset-2">
            the box is on the front page
          </Link>
          .
        </p>
      ) : (
        <>
          <Section title={`Waiting to be read (${waiting.length})`} rows={waiting} />
          {done.length > 0 && <Section title={`Asked for and read (${done.length})`} rows={done} />}
        </>
      )}

      <p className="mt-10 text-[14px] leading-relaxed text-muted">
        <Link href="/" className="text-link underline underline-offset-2">Back to the wire</Link>
        {" · "}
        <Link href="/method" className="text-link underline underline-offset-2">why the reading is slow</Link>
      </p>
    </Sheet>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="mt-9">
      <h2 className="border-b border-rule pb-2 text-[15px] font-bold">{title}</h2>
      <div className="divide-y divide-rule-soft">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-2.5">
            {r.artwork ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artwork(r.artwork, 96)!} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-[7px] border border-rule" />
            ) : (
              <span aria-hidden className="h-8 w-8 shrink-0 rounded-[7px] border border-rule bg-surface" />
            )}
            <span className="min-w-0 flex-1">
              {r.read ? (
                <Link href={`/a/${appSlug(r.name)}`} className="block truncate text-[15px] font-semibold hover:text-loud">
                  {r.name}
                </Link>
              ) : (
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
              )}
              <span className="tnum block font-mono text-[11px] text-faint">
                {r.average != null ? `${r.average.toFixed(2)}★` : "no rating"}
                {r.count != null && ` from ${r.count.toLocaleString("en-GB")}`}
                {" · asked "}
                {r.asked === 1 ? "once" : `${r.asked} times`}
                {`, last ${ago(r.last)}`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
