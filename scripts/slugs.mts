/** Gives every app a unique URL. Safe to re-run; it only touches nulls. */
import { fillSlugs } from "../src/lib/jobs";
/* A GitHub runner has no .env.local; it gets the secrets from the environment.
   Demanding the file made every sharded run exit 1 before it asked Apple
   anything. */
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.local"); } catch { /* CI passes it in */ }
}
console.log(await fillSlugs());
