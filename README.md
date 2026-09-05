# SWBC scaffold

The template every build day starts from. Make this a GitHub **template
repository**: each morning, "Use this template" gives a fresh repo, import it
to Vercel, and hour zero already has the boring part done.

## Do not remove the `packageManager` pin

`package.json` pins `pnpm@10.18.0`. Without it Vercel infers a pnpm version
from the lockfile format, and on day 1 that guess produced
`Command "pnpm install" exited with 1` on a repository where a clean
`pnpm install --frozen-lockfile` succeeded locally every time. Two deploys
were silently lost to it before the cause was found.

`pnpm.onlyBuiltDependencies` is there for the same reason: pnpm 10 refuses to
run a dependency's build scripts unless they are named. Locally that is a
warning. On CI it can be an error.

## First-time setup (once)

1. `pnpm install`
2. Create a Neon project (free plan: 100 projects, 0.5 GB each) and copy the
   connection string.
3. `cp .env.example .env.local` and fill it in.
4. `pnpm db:push` to create the tables.
5. `pnpm dev`

## Per build day

1. "Use this template" on GitHub.
2. Change **one file** to give the site its identity: `src/app/globals.css`.
   Swap `--color-accent` and `--color-ground`. Do not build a shared design
   system - 26 identical sites read as a template farm.
3. Replace `src/app/page.tsx`.
4. Point a wildcard subdomain at it. Never buy a domain on a build day.

## What is wired

| Thing | Where | Why it is here |
|---|---|---|
| `getOrCompute(key, ttl, fn)` | `src/lib/cache.ts` | Makes "no LLM in the request path" true rather than aspirational |
| `complete()` / `batchSubmit()` | `src/lib/llm.ts` | Haiku for scoring, Sonnet for prose. Input hash is the cache key, so URL tools dedupe for free |
| `checkGate(req)` | `src/lib/ratelimit.ts` | Per-IP limit **and** a global daily ceiling |
| `<Exhausted />` | `src/components/` | The state you will not have time to design on a viral day |
| `/api/og` | `src/app/api/og/` | Share images. **The font problem is already solved** |
| `/r/[id]` | `src/app/r/` | Shareable results with no auth anywhere in the system |
| `/api/submit` | `src/app/api/submit/` | Unauthenticated submissions, honeypot + time-on-form |
| `/api/cron/[job]` | `src/app/api/cron/` | Secret-gated. Jobs end by writing an artifact |
| `writeArtifact()` | `src/lib/artifact.ts` | Static reads. Neon scales to zero after 5 min and you cannot disable it |
| `<SponsorSlot />` | `src/components/` | Env-driven. Renders an honest placeholder until a sponsor exists |

## Three traps already paid for

1. **OG fonts.** `ImageResponse` cannot use a CSS font-family and a modern
   user-agent gets woff2, which it cannot read. `src/app/api/og/route.tsx`
   spoofs an old UA to get a TTF and memoises it. Verified: 111 KB TTF.
2. **The rate limiter needs a unique key.** `events.bucket` is the PRIMARY
   KEY. Without that there is no conflict to catch, every count returns 1, and
   both limits silently never fire.
3. **Cold Postgres.** Anything precomputed must be read from an artifact, not
   queried on the request path.

## Deploy

Vercel **Pro**, not Hobby. Hobby's terms name advertisements as commercial
use, sponsor slots are advertisements, and Vercel may suspend commercial
projects on Hobby without notice.
