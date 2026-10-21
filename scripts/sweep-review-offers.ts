/**
 * Sweep and expire stale review offers (#1034).
 *
 *   pnpm tsx scripts/sweep-review-offers.ts
 *
 * Operator-run or cron-run against the database in DATABASE_URL. The platform
 * runner (`lib/cron/runner.ts`) also calls this sweep, so this is for manual
 * recovery, e.g. after an outage that stopped the scheduler.
 */
import { sweepExpiredReviewOffers } from "../lib/agent-api/review-offer";

async function main() {
  const result = await sweepExpiredReviewOffers();
  console.log(`Swept ${result.expired} expired review offer(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
