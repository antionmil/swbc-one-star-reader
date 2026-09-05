import { pgTable, text, integer, timestamp, jsonb, serial, primaryKey, index, real } from "drizzle-orm/pg-core";

/**
 * The watchlist, the reviews, and what the model made of them.
 *
 * Reviews are append-only and keyed on Apple's own review id, so re-fetching a
 * page we already have is a no-op rather than a duplicate. That matters more
 * than it sounds: Apple's feed hands out the same page again and again, and
 * this key is the only thing separating "50 new complaints" from "the same 50
 * complaints".
 */

export const apps = pgTable("apps", {
  id: text("id").primaryKey(),              // Apple's numeric app id, as text
  name: text("name").notNull(),
  genre: text("genre"),
  added_at: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  app_id: text("app_id").notNull(),
  store: text("store").notNull(),           // "us", "de", ...
  review_id: text("review_id").notNull(),   // Apple's id for the review
  rating: integer("rating").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  version: text("version"),
  /** Position in the page Apple served, so "most recent first" survives the
   *  trip into the database. The backfill kept the feed's own order; the cron
   *  writes 0 for anything it fetches, which is newer than everything. */
  seq: integer("seq").notNull().default(0),
  /** When Apple says it was written. */
  written_at: timestamp("written_at", { withTimezone: true }),
  /** When WE first saw it. The gap between the two is the honest measure of
   *  how far behind Apple's throttle has pushed us. */
  first_seen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.app_id, t.store, t.review_id] }),
  index("reviews_app_idx").on(t.app_id, t.store, t.rating),
]);

/** One row per attempt to fetch one page. An empty answer is recorded as an
 *  empty answer: Apple returns 200 with no entries when it throttles, and a
 *  site that reads that as "no complaints today" is lying to its readers. */
export const fetches = pgTable("fetches", {
  id: serial("id").primaryKey(),
  run_id: integer("run_id").notNull(),
  app_id: text("app_id").notNull(),
  store: text("store").notNull(),
  page: integer("page").notNull(),
  got: integer("got").notNull(),            // entries Apple returned
  fresh: integer("fresh").notNull(),        // of those, ones we had not seen
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fetches_run_idx").on(t.run_id)]);

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finished_at: timestamp("finished_at", { withTimezone: true }),
  pages_tried: integer("pages_tried").notNull().default(0),
  pages_answered: integer("pages_answered").notNull().default(0),
  new_reviews: integer("new_reviews").notNull().default(0),
  clustered: integer("clustered").notNull().default(0),
});

/**
 * What the complaints are. One row per complaint per app per storefront,
 * rewritten whenever that app is re-clustered.
 *
 * `key` is a stable slug the model is told to reuse. It is what makes "this
 * complaint is new" answerable: comparing prose labels between runs would call
 * every reworded sentence a new complaint.
 */
export const clusters = pgTable("clusters", {
  id: serial("id").primaryKey(),
  app_id: text("app_id").notNull(),
  store: text("store").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  blurb: text("blurb").notNull(),
  n: integer("n").notNull(),
  share: real("share").notNull(),           // of the negative reviews read
  /** Review ids the model cited. The page prints those reviews verbatim. */
  quotes: jsonb("quotes").$type<string[]>().notNull(),
  /** The run that first produced this key for this app and store. */
  first_run: integer("first_run").notNull(),
  run_id: integer("run_id").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("clusters_app_idx").on(t.app_id, t.store, t.run_id)]);

/**
 * The daily rating reading, per app per storefront.
 *
 * This is the part that moves every day. Apple's REVIEW feed refuses
 * datacentre addresses — GitHub's runners got zero of six pages, and two other
 * cloud addresses got nothing either — but the LOOKUP endpoint answers happily
 * from anywhere. So the score, the number of ratings and the shipped version
 * are collected on the site's own cron, and the reviews are topped up whenever
 * Apple lets a page through from somewhere else.
 *
 * One row per app, storefront and day: `day` is a plain YYYY-MM-DD string, so
 * a second run on the same day corrects that day rather than adding a fake
 * data point.
 */
export const ratings = pgTable("ratings", {
  app_id: text("app_id").notNull(),
  store: text("store").notNull(),
  day: text("day").notNull(),
  average: real("average"),
  count: integer("count"),
  version: text("version"),
  released_at: timestamp("released_at", { withTimezone: true }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.app_id, t.store, t.day] })]);
