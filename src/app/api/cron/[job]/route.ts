import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { collectRatings, reclusterStale } from "@/lib/jobs";

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
    const ratings = await collectRatings();
    const clusters = await reclusterStale();
    /* Push it out now rather than waiting for each page's hour to expire. Day 4
       shipped a corrected figure, watched the deployment go READY, and served
       the old number for an hour. */
    revalidatePath("/", "layout");
    return { ratings, clusters };
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
