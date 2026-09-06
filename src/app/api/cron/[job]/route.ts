import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { fetchPage } from "@/lib/apple";
import { collectRatings, fillSlugs, reclusterStale } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Secret-gated. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, and
 * anybody else gets a 401 with no hint about which jobs exist.
 *
 * A guard is only a guard once you have fired the thing it exists to stop, so
 * this one is fired at: qa/cron.test.mts.
 */
const JOBS: Record<string, () => Promise<unknown>> = {
  daily: async () => {
    const slugs = await fillSlugs();
    const ratings = await collectRatings();
    const clusters = await reclusterStale();
    /* Push it out now rather than waiting for each page's hour to expire. Day 4
       shipped a corrected figure, watched the deployment go READY, and served
       the old number for an hour. */
    revalidatePath("/", "layout");
    return { slugs, ratings, clusters };
  },
  /* Does Apple serve THIS address? GitHub's runners get nothing and two other
     cloud networks get nothing, but each network has to be measured rather
     than assumed — the answer decides whether a reader can ask for an app and
     get it read. */
  probe: async () => {
    const out: Record<string, number | null> = {};
    for (const [app, store] of [["310633997", "us"], ["835599320", "us"], ["310633997", "de"]] as const) {
      const page = await fetchPage(app, store, 1);
      out[`${app}/${store}`] = page ? page.length : null;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return out;
  },
  refresh: async () => {
    revalidatePath("/", "layout");
    return { revalidated: "every page" };
  },
};

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { job } = await params;
  const fn = JOBS[job];
  if (!fn) return NextResponse.json({ error: "Unknown job" }, { status: 404 });

  const started = Date.now();
  try {
    return NextResponse.json({ ok: true, job, ms: Date.now() - started, result: await fn() });
  } catch (e) {
    return NextResponse.json({ ok: false, job, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
