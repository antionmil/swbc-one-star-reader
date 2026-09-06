# One-star reader

What people actually hate about the apps they use every day.

Apple publishes a public feed of one- and two-star App Store reviews. This site
reads them, groups them into the complaints that keep coming back, and prints a
real count and a real quote beside each one. Day 5 of a 26-day run.

Live at **onestarreader.onedaybuilt.com**.

## The shape of it

| | |
|---|---|
| Watched | ~11,800 apps, from every genre chart in four storefronts |
| Read | the apps whose review feed a collector has reached |
| Storefronts | United States, Germany, Britain, France |
| Model | `claude-haiku-4-5`, Batch API, for grouping and translation only |

A **watched** app has a name, a genre and a score. A **read** app also has its
complaints. The gap between those two numbers is the whole engineering problem
below.

## Two Apple endpoints, two different rations

Both were measured, not assumed. Both measurements are in
`src/lib/apple.ts` and `src/lib/schema.ts` next to the code they explain.

**The review feed** hands out fifty reviews a page, ten pages deep — a hard
ceiling of 500 per app per storefront — and rations that to roughly one page per
address every ten minutes. A throttled request returns **HTTP 200 with an empty
feed**, not an error, so a site that trusts it publishes "no complaints" when it
means "we were blocked". Every attempt is recorded, answered or not.

**The lookup endpoint** gives a score, a rating count and a version. It answers
one request instantly from anywhere, including datacentre addresses. Asked
45,000 times from one address it refuses about three in four, and asking more
slowly does not help: five a second and forty a second were refused at the same
rate. The lever is the address, not the pace.

So neither feed is collected from Vercel. Both run as scheduled GitHub Actions,
four shards each, because a fresh runner is a fresh address:

- `.github/workflows/collect.yml` — reviews, every 15 minutes, 14 pages a shard
- `.github/workflows/ratings.yml` — scores, hourly, 900 pairs a shard

`watch` holds the app/storefront pairs worth asking about — where the app
actually charted, plus all four storefronts for anything somebody requested.
That is 20,124 pairs instead of the 47,192 a blind cross join produces, and
27,000 questions a night that could never have had an answer.

## Slugs are stored, never derived

`apps.slug`, unique index, filled by `fillSlugs()`. Five apps here are called
McDonald's and 62 have names written entirely in Chinese, Arabic or Japanese
that reduce to an empty string. Deriving a URL from a name in the browser — as
the search box did — sends a reader to another company's page.

## Costs

Free except the model. Grouping and translating everything read so far has cost
about **$0.63** in total, at Batch API rates. No model is ever called while
somebody waits; the site only reads what the cron has already written.

## Running it

```
pnpm install
cp .env.example .env.local     # DATABASE_URL, ANTHROPIC_API_KEY, CRON_SECRET
pnpm db:push
pnpm dev
```

Scripts import `server-only`, so they run under
`tsx --conditions=react-server`:

| Script | What it does |
|---|---|
| `scripts/import-charts.mts` | walks 224 genre charts, fills `apps` and `watch` |
| `scripts/ratings.mts` | one turn of the score rotation |
| `scripts/collect.mts` | one shard of the review collector |
| `scripts/cluster.mts` | groups complaints via the Batch API (`--stale` for new reviews only) |
| `scripts/translate.mts` | translates the quoted reviews |
| `scripts/slugs.mts` | gives new apps their URL |

## House rules that apply here

`packageManager` is pinned to `pnpm@10.18.0` and `pnpm.onlyBuiltDependencies`
is set — without both, Vercel guesses a pnpm version and the install can exit 1
on a repo that builds locally every time. Neon is in Frankfurt and
`vercel.json` pins `fra1`; a mismatched region puts a transatlantic hop on
every query. Reads and writes go through a `server-only` module.
