/** Reads today's rating, rating count and version for every app. The same
 *  function the daily cron calls. */
import { collectRatings } from "../src/lib/jobs";
/* A GitHub runner has no .env.local; it gets the secrets from the environment.
   Demanding the file made every sharded run exit 1 before it asked Apple
   anything. */
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.local"); } catch { /* CI passes it in */ }
}
console.log(await collectRatings());
