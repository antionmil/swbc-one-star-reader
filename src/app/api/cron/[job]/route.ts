import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron entry point. Wire jobs in vercel.json:
 *   { "crons": [{ "path": "/api/cron/refresh", "schedule": "0 6 * * *" }] }
 *
 * Hobby allows one firing a day with hour-level precision; Pro gives
 * per-minute. You are on Pro anyway, because sponsor slots are advertisements
 * and Vercel's Hobby terms name advertisements as commercial use.
 *
 * Every job here should end by WRITING AN ARTIFACT, not by leaving data that
 * the request path has to query. Use the Batch API inside these - 50% off and
 * nobody is waiting.
 */
const JOBS: Record<string, () => Promise<unknown>> = {};

export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  const fn = JOBS[job];
  if (!fn) return NextResponse.json({ error: `Unknown job "${job}"` }, { status: 404 });

  const started = Date.now();
  try {
    const result = await fn();
    return NextResponse.json({ ok: true, job, ms: Date.now() - started, result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, job, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
