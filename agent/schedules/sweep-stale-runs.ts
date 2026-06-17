/**
 * Scheduled job: nudge issues that have been waiting for human approval too long.
 *
 * ⚠️ API CONFIDENCE: PARTIAL.
 * `defineSchedule` is named in the Eve announcement as the cron API, but the
 * exact option/handler shape isn't published verbatim. The handler body below
 * uses only our verified core (`findStaleRuns`), so once the wrapper signature
 * is confirmed this becomes a one-line adjustment.
 *
 * TODO(eve): after `npm install eve@latest`, confirm `defineSchedule` in
 *   node_modules/eve/dist/docs/public/ (cron expression field name, handler
 *   signature, how to post back to a channel) and uncomment the export.
 */

import { findStaleRuns } from "../../src/workflow/sweep-stale-runs.js";
import { logger } from "../../src/utils/logger.js";

/** Verified core: list runs parked in WAITING_FOR_APPROVAL / FIX_FAILED. */
export async function sweep(): Promise<void> {
  const stale = findStaleRuns();
  logger.info(`Stale-run sweep found ${stale.length} run(s) awaiting action.`, {
    runs: stale.map((s) => `${s.issueKey}:${s.state}`),
  });
  // TODO(eve): for each stale run, post a reminder comment via the GitHub channel
  // / provider, e.g. "This issue has a reproduction report awaiting /fix or /stop."
}

// Intended Eve wiring (uncomment once the signature is confirmed):
//
// import { defineSchedule } from "eve";
// export default defineSchedule({
//   cron: "0 9 * * *", // daily at 09:00 UTC
//   async run() {
//     await sweep();
//   },
// });

export {};
