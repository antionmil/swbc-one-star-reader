/** Reads today's rating, rating count and version for every app. The same
 *  function the daily cron calls. */
import { collectRatings } from "../src/lib/jobs";
process.loadEnvFile(".env.local");
console.log(await collectRatings());
