import "server-only";

/**
 * Turning a wall of one-star reviews into the complaints that actually recur.
 *
 * Two rules shape everything here.
 *
 * The counts must be REAL. The model is not asked "how many people complained
 * about X" — it is asked to put every review it was given into a group, and the
 * counts are then arithmetic on its answer. An estimated count is a fabricated
 * metric, and this site prints counts next to quotes.
 *
 * The quotes must be REAL. The model returns the index of each review it read,
 * never prose it wrote itself, so every quote on the site is a string a person
 * actually typed into the App Store.
 */

export type ClusterOut = {
  key: string;
  label: string;
  blurb: string;
  members: number[];
};

export const MODEL = "claude-haiku-4-5";

/** How many negative reviews go into one clustering call. Every page states
 *  this number, because "the three complaints" means nothing without "out of
 *  how many". */
export const SAMPLE = 120;

export function systemPrompt() {
  return [
    "You group negative App Store reviews into the complaints that recur.",
    "",
    "Rules:",
    "1. Only report complaints that are actually in the reviews you were given. Never infer a complaint from what the app is.",
    "2. Every group needs at least three reviews. Anything rarer belongs in no group.",
    "3. `members` lists the index numbers of the reviews in that group. Use each index at most once, across all groups. Leave a review out if it fits nothing.",
    "4. `label` is a plain noun phrase of at most eight words, in English, describing what breaks or annoys. Not a category name. 'Account banned with no explanation', not 'Account issues'.",
    "5. `blurb` is one sentence of at most twenty-five words saying what the reviews say, in the reviewers' own terms.",
    "6. `key` is a lowercase slug of two or three words, stable and reusable: the same complaint next week must produce the same key. 'account-bans', 'share-sheet-preview'.",
    "7. Return between two and five groups, largest first.",
    "8. Reviews may be in any language. Write the label and blurb in English whatever the reviews are in.",
    "",
    'Answer with JSON only, no prose and no code fence: {"clusters":[{"key":"...","label":"...","blurb":"...","members":[1,2,3]}]}',
  ].join("\n");
}

/**
 * Strips unpaired surrogates.
 *
 * A review carrying half an emoji is not valid UTF-16, `JSON.stringify` emits
 * it as-is, and the API rejects the whole batch with "no low surrogate in
 * string: line 1 column 49932" — one broken character in one review out of
 * four thousand, and nothing gets clustered.
 */
export const clean = (s: string) =>
  s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");

export function userPrompt(app: string, store: string, rows: { title: string; body: string; rating: number }[]) {
  const lines = rows.map((r, i) => {
    /* clean() runs LAST, after the slice. Cleaning first and then cutting to
       120 characters splits a valid emoji down the middle and manufactures the
       exact broken character this function exists to remove — which is how two
       of thirty-six requests still poisoned the batch after the first fix. */
    const t = clean(r.title.replace(/\s+/g, " ").trim().slice(0, 120));
    const b = clean(r.body.replace(/\s+/g, " ").trim().slice(0, 320));
    return `${i + 1}. (${r.rating}★) ${t} — ${b}`;
  });
  return [
    `App: ${app}. Storefront: ${store.toUpperCase()}. ${rows.length} reviews of one or two stars, most recent first.`,
    "",
    ...lines,
  ].join("\n");
}

/** Tolerant of a model that wraps JSON in a fence despite being told not to. */
export function parseClusters(text: string): ClusterOut[] {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { clusters?: ClusterOut[] };
    return (parsed.clusters ?? []).filter(
      (c) => c && typeof c.key === "string" && Array.isArray(c.members) && c.members.length >= 3,
    );
  } catch {
    return [];
  }
}
