/** Gives every app a unique URL. Safe to re-run; it only touches nulls. */
import { fillSlugs } from "../src/lib/jobs";
process.loadEnvFile(".env.local");
console.log(await fillSlugs());
